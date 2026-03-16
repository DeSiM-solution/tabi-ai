#!/usr/bin/env node
import { createHash } from 'node:crypto';
import process from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'handbook';
const DEFAULT_HTML_SCOPE = 'unsplash-data-only';
const DEFAULT_FAILURE_MODE = 'global-abort';
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_DB_MAX_RETRIES = 3;
const DEFAULT_DB_RETRY_DELAY_MS = 1_000;

const CONTENT_TYPE_EXTENSION_MAP = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

const JSON_IMAGE_URL_KEYS = new Set([
  'image_url',
  'thumbnailUrl',
  'coverImageUrl',
  'cover_image_url',
]);

function printUsage() {
  console.log([
    'Usage: node scripts/backfill-handbook-images-to-supabase.mjs [options]',
    '',
    'Options:',
    '  --dry-run                 Scan only, do not upload or write DB',
    '  --session-id <id>         Process one session only',
    '  --limit <n>               Process at most N sessions (after filters)',
    '  --help                    Show this help',
  ].join('\n'));
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    sessionId: null,
    limit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--help') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--session-id') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--session-id requires a value');
      }
      options.sessionId = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--session-id=')) {
      options.sessionId = arg.slice('--session-id='.length);
      continue;
    }
    if (arg === '--limit') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--limit requires a value');
      }
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--limit must be a positive integer');
      }
      options.limit = parsed;
      i += 1;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const parsed = Number.parseInt(arg.slice('--limit='.length), 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--limit must be a positive integer');
      }
      options.limit = parsed;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizePathSegment(input, fallback) {
  const normalized = String(input ?? '').trim();
  if (!normalized) return fallback;
  const sanitized = normalized
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return sanitized || fallback;
}

function normalizeContentType(value) {
  if (!value) return 'application/octet-stream';
  const normalized = String(value).split(';')[0]?.trim().toLowerCase();
  return normalized || 'application/octet-stream';
}

function withConnectionLimit(connectionString, limit) {
  try {
    const parsed = new URL(connectionString);
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', String(limit));
    }
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

function extensionFromContentType(contentType) {
  return CONTENT_TYPE_EXTENSION_MAP[contentType] ?? 'bin';
}

function isDataImageUrl(url) {
  return typeof url === 'string' && url.trim().toLowerCase().startsWith('data:image/');
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^(https?:)\/\//i.test(url.trim());
}

function isUnsplashUrl(url) {
  if (!isHttpUrl(url)) return false;
  try {
    const hostname = new URL(url.trim()).hostname.toLowerCase();
    return hostname === 'unsplash.com' || hostname.endsWith('.unsplash.com');
  } catch {
    return false;
  }
}

function createSupabaseHelpers({ supabaseUrl, bucket }) {
  const parsedOrigin = new URL(supabaseUrl).origin;
  const publicPrefix = `/storage/v1/object/public/${bucket}/`;

  const isSupabasePublicUrl = url => {
    if (typeof url !== 'string' || !url.trim()) return false;
    try {
      const parsed = new URL(url.trim());
      return parsed.origin === parsedOrigin && parsed.pathname.startsWith(publicPrefix);
    } catch {
      return false;
    }
  };

  const buildPublicUrlByPath = path => `${parsedOrigin}${publicPrefix}${path}`;

  return {
    isSupabasePublicUrl,
    buildPublicUrlByPath,
  };
}

function shouldReplaceJsonUrl(url, { isSupabasePublicUrl }) {
  const normalized = typeof url === 'string' ? url.trim() : '';
  if (!normalized) return false;
  if (isSupabasePublicUrl(normalized)) return false;
  if (isDataImageUrl(normalized)) return true;
  if (isHttpUrl(normalized)) {
    return isUnsplashUrl(normalized);
  }
  return false;
}

function shouldReplaceHtmlUrl(url, { isSupabasePublicUrl }) {
  const normalized = typeof url === 'string' ? url.trim() : '';
  if (!normalized) return false;
  if (isSupabasePublicUrl(normalized)) return false;
  if (isDataImageUrl(normalized)) return true;
  if (DEFAULT_HTML_SCOPE === 'unsplash-data-only') {
    return isUnsplashUrl(normalized);
  }
  return isHttpUrl(normalized);
}

function parseDataImageUrl(dataUrl) {
  const raw = dataUrl.trim();
  const separatorIndex = raw.indexOf(',');
  if (separatorIndex < 0) {
    throw new Error('Invalid data URL: missing separator');
  }

  const metadata = raw.slice(5, separatorIndex);
  const payload = raw.slice(separatorIndex + 1);
  const isBase64 = metadata.split(';').some(token => token.toLowerCase() === 'base64');
  const mediaType = metadata.split(';')[0] ?? '';
  const contentType = normalizeContentType(mediaType || null);
  const extension = extensionFromContentType(contentType);
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf-8');

  if (buffer.length === 0) {
    throw new Error('Invalid data URL: empty payload');
  }

  return {
    buffer,
    contentType,
    extension,
  };
}

async function fetchImageAsBuffer(sourceUrl) {
  const response = await fetch(sourceUrl, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}) for ${sourceUrl}`);
  }

  const contentType = normalizeContentType(response.headers.get('content-type'));
  const extension = extensionFromContentType(contentType);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new Error(`Image download returned empty body for ${sourceUrl}`);
  }

  return {
    buffer,
    contentType,
    extension,
  };
}

function isStorageAlreadyExistsError(error) {
  if (!error || typeof error !== 'object') return false;
  const statusCode = typeof error.statusCode === 'string' ? error.statusCode : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    statusCode === '409'
    || message.includes('already exists')
    || message.includes('duplicate')
    || message.includes('resource already exists')
  );
}

function isDbTransientError(error) {
  const errorCode = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
  if (errorCode === 'P1001') {
    return true;
  }

  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (!message) return false;
  return (
    message.includes('connection terminated unexpectedly')
    || message.includes('connection terminated')
    || message.includes('econnreset')
    || message.includes("can't reach database server")
    || message.includes('database server at')
    || message.includes('max clients reached')
    || message.includes('server closed the connection unexpectedly')
  );
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function countJsonCandidates(value, helpers) {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countJsonCandidates(item, helpers), 0);
  }
  if (!isRecord(value)) return 0;

  let count = 0;
  for (const [key, child] of Object.entries(value)) {
    if (JSON_IMAGE_URL_KEYS.has(key) && typeof child === 'string') {
      if (shouldReplaceJsonUrl(child, helpers)) {
        count += 1;
      }
      continue;
    }
    count += countJsonCandidates(child, helpers);
  }
  return count;
}

function collectHtmlCandidateSrcs(html, helpers) {
  if (typeof html !== 'string' || !html) return [];
  const regex = /<img\b[^>]*\bsrc=(['"])(.*?)\1/gi;
  const candidates = new Set();
  let match;
  while ((match = regex.exec(html)) !== null) {
    const src = match[2] ?? '';
    if (shouldReplaceHtmlUrl(src, helpers)) {
      candidates.add(src.trim());
    }
  }
  return [...candidates];
}

function collectHtmlCandidateCssUrls(html, helpers) {
  if (typeof html !== 'string' || !html) return [];
  const regex = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")\s][^)]*))\s*\)/gi;
  const candidates = new Set();
  let match;
  while ((match = regex.exec(html)) !== null) {
    const src = match[1] ?? match[2] ?? match[3] ?? '';
    if (shouldReplaceHtmlUrl(src, helpers)) {
      candidates.add(src.trim());
    }
  }
  return [...candidates];
}

function collectHtmlCandidateUrls(html, helpers) {
  const candidates = new Set([
    ...collectHtmlCandidateSrcs(html, helpers),
    ...collectHtmlCandidateCssUrls(html, helpers),
  ]);
  return [...candidates];
}

function replaceHtmlWithMappedUrls(html, helpers, mapping) {
  if (!mapping || mapping.size === 0) {
    return {
      html,
      changed: false,
      replacedCount: 0,
    };
  }

  let replacedCount = 0;
  const imgRegex = /<img\b[^>]*\bsrc=(['"])(.*?)\1/gi;
  let nextHtml = html.replace(imgRegex, (full, quote, src) => {
    if (!shouldReplaceHtmlUrl(src, helpers)) return full;
    const normalizedSrc = String(src).trim();
    const nextSrc = mapping.get(normalizedSrc);
    if (!nextSrc || nextSrc === normalizedSrc) return full;
    replacedCount += 1;
    return full.replace(src, nextSrc);
  });
  const cssUrlRegex = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")\s][^)]*))\s*\)/gi;
  nextHtml = nextHtml.replace(cssUrlRegex, (full, singleQuoted, doubleQuoted, bare) => {
    const src = singleQuoted ?? doubleQuoted ?? bare ?? '';
    if (!shouldReplaceHtmlUrl(src, helpers)) return full;
    const normalizedSrc = String(src).trim();
    const nextSrc = mapping.get(normalizedSrc);
    if (!nextSrc || nextSrc === normalizedSrc) return full;
    replacedCount += 1;
    if (singleQuoted !== undefined) return `url('${nextSrc}')`;
    if (doubleQuoted !== undefined) return `url("${nextSrc}")`;
    return `url(${nextSrc})`;
  });

  return {
    html: nextHtml,
    changed: replacedCount > 0,
    replacedCount,
  };
}

async function replaceJsonImageUrls(value, helpers, resolver) {
  if (Array.isArray(value)) {
    let changed = false;
    let replacedCount = 0;
    const next = [];
    for (const item of value) {
      const child = await replaceJsonImageUrls(item, helpers, resolver);
      next.push(child.value);
      if (child.changed) changed = true;
      replacedCount += child.replacedCount;
    }
    return {
      value: changed ? next : value,
      changed,
      replacedCount,
    };
  }

  if (!isRecord(value)) {
    return {
      value,
      changed: false,
      replacedCount: 0,
    };
  }

  let changed = false;
  let replacedCount = 0;
  const nextObject = {};

  for (const [key, child] of Object.entries(value)) {
    if (JSON_IMAGE_URL_KEYS.has(key) && typeof child === 'string') {
      if (shouldReplaceJsonUrl(child, helpers)) {
        const nextUrl = await resolver(child);
        nextObject[key] = nextUrl;
        if (nextUrl !== child) {
          changed = true;
          replacedCount += 1;
        }
        continue;
      }
      nextObject[key] = child;
      continue;
    }

    const nested = await replaceJsonImageUrls(child, helpers, resolver);
    nextObject[key] = nested.value;
    if (nested.changed) changed = true;
    replacedCount += nested.replacedCount;
  }

  return {
    value: changed ? nextObject : value,
    changed,
    replacedCount,
  };
}

function buildSessionQuery({ sessionId, limit }) {
  const where = sessionId ? { id: sessionId } : undefined;
  const take = Number.isInteger(limit) && limit > 0 ? limit : undefined;

  return {
    where,
    orderBy: { createdAt: 'asc' },
    take,
    select: {
      id: true,
      activeHandbookId: true,
      state: {
        select: {
          context: true,
          toolOutputs: true,
        },
      },
      handbooks: {
        select: {
          id: true,
          sourceContext: true,
          sourceToolOutputs: true,
          html: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
    );
  }

  const dbConnectionString = withConnectionLimit(databaseUrl, 1);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: dbConnectionString }),
    log: ['error', 'warn'],
  });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const helpers = createSupabaseHelpers({
    supabaseUrl,
    bucket,
  });

  const stats = {
    mode: options.dryRun ? 'dry-run' : 'apply',
    failureMode: DEFAULT_FAILURE_MODE,
    htmlScope: DEFAULT_HTML_SCOPE,
    sessionsScanned: 0,
    handbooksScanned: 0,
    candidateUrlsFound: 0,
    uniqueUploadsTried: 0,
    uploadSuccessCount: 0,
    uploadReuseCount: 0,
    uploadFailureCount: 0,
    referencesReplaced: 0,
    sessionStateUpdated: 0,
    handbookJsonUpdated: 0,
    handbookHtmlUpdated: 0,
    sessionStateWouldUpdate: 0,
    handbookJsonWouldUpdate: 0,
    handbookHtmlWouldUpdate: 0,
  };

  const sourceToPublicUrl = new Map();
  const pathToPublicUrl = new Map();

  const runDbWithRetry = async (label, operation) => {
    let attempt = 0;
    let lastError;

    while (attempt < DEFAULT_DB_MAX_RETRIES) {
      attempt += 1;
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const retryable = isDbTransientError(error);
        if (!retryable || attempt >= DEFAULT_DB_MAX_RETRIES) {
          throw error;
        }

        const waitMs = DEFAULT_DB_RETRY_DELAY_MS * attempt;
        console.warn(
          `[backfill:handbook-images] db transient error (${label}), retry ${attempt}/${DEFAULT_DB_MAX_RETRIES} after ${waitMs}ms`,
        );
        await sleep(waitMs);
      }
    }

    throw lastError;
  };

  const resolveStorageUrl = async (sourceUrl, context) => {
    const normalizedSource = sourceUrl.trim();
    if (!normalizedSource || helpers.isSupabasePublicUrl(normalizedSource)) {
      return normalizedSource;
    }

    const sessionSegment = sanitizePathSegment(context.sessionId, 'unknown-session');
    const handbookSegment = sanitizePathSegment(context.handbookSegment, 'runtime-backfill');
    const sourceCacheKey = `${sessionSegment}|${handbookSegment}|${normalizedSource}`;

    if (sourceToPublicUrl.has(sourceCacheKey)) {
      stats.uploadReuseCount += 1;
      return sourceToPublicUrl.get(sourceCacheKey);
    }

    const materialized = isDataImageUrl(normalizedSource)
      ? parseDataImageUrl(normalizedSource)
      : await fetchImageAsBuffer(normalizedSource);

    const sha1 = createHash('sha1').update(materialized.buffer).digest('hex');
    const extension = (materialized.extension || 'bin').toLowerCase();
    const objectPath = `handbooks/${sessionSegment}/${handbookSegment}/${sha1}.${extension}`;

    if (pathToPublicUrl.has(objectPath)) {
      const reusedPublicUrl = pathToPublicUrl.get(objectPath);
      sourceToPublicUrl.set(sourceCacheKey, reusedPublicUrl);
      stats.uploadReuseCount += 1;
      return reusedPublicUrl;
    }

    stats.uniqueUploadsTried += 1;
    const bucketRef = supabase.storage.from(bucket);
    const { error } = await bucketRef.upload(objectPath, materialized.buffer, {
      contentType: materialized.contentType,
      upsert: false,
    });

    if (error && !isStorageAlreadyExistsError(error)) {
      stats.uploadFailureCount += 1;
      throw new Error(`Supabase upload failed for ${objectPath}: ${error.message}`);
    }

    const publicUrl = helpers.buildPublicUrlByPath(objectPath);
    pathToPublicUrl.set(objectPath, publicUrl);
    sourceToPublicUrl.set(sourceCacheKey, publicUrl);

    if (error && isStorageAlreadyExistsError(error)) {
      stats.uploadReuseCount += 1;
    } else {
      stats.uploadSuccessCount += 1;
    }

    return publicUrl;
  };

  try {
    const sessions = await runDbWithRetry(
      'load sessions',
      () =>
        db.session.findMany(
          buildSessionQuery({
            sessionId: options.sessionId,
            limit: options.limit,
          }),
        ),
    );

    for (const session of sessions) {
      stats.sessionsScanned += 1;
      const runtimeSegment = session.activeHandbookId || `runtime-${session.id}`;

      if (session.state) {
        if (options.dryRun) {
          const contextCandidates = countJsonCandidates(session.state.context, helpers);
          const toolOutputsCandidates = countJsonCandidates(session.state.toolOutputs, helpers);
          const totalCandidates = contextCandidates + toolOutputsCandidates;
          stats.candidateUrlsFound += totalCandidates;
          if (totalCandidates > 0) {
            stats.sessionStateWouldUpdate += 1;
          }
        } else {
          const contextResult = await replaceJsonImageUrls(
            session.state.context,
            helpers,
            sourceUrl =>
              resolveStorageUrl(sourceUrl, {
                sessionId: session.id,
                handbookSegment: runtimeSegment,
              }),
          );
          const toolOutputsResult = await replaceJsonImageUrls(
            session.state.toolOutputs,
            helpers,
            sourceUrl =>
              resolveStorageUrl(sourceUrl, {
                sessionId: session.id,
                handbookSegment: runtimeSegment,
              }),
          );

          stats.candidateUrlsFound += contextResult.replacedCount + toolOutputsResult.replacedCount;
          stats.referencesReplaced += contextResult.replacedCount + toolOutputsResult.replacedCount;

          if (contextResult.changed || toolOutputsResult.changed) {
            await runDbWithRetry(
              `update sessionState ${session.id}`,
              () =>
                db.sessionState.update({
                  where: { sessionId: session.id },
                  data: {
                    context: contextResult.value,
                    toolOutputs: toolOutputsResult.value,
                  },
                }),
            );
            stats.sessionStateUpdated += 1;
          }
        }
      }

      for (const handbook of session.handbooks) {
        stats.handbooksScanned += 1;

        if (options.dryRun) {
          const jsonCandidates =
            countJsonCandidates(handbook.sourceContext, helpers)
            + countJsonCandidates(handbook.sourceToolOutputs, helpers);
          const htmlCandidates = collectHtmlCandidateUrls(handbook.html, helpers).length;

          stats.candidateUrlsFound += jsonCandidates + htmlCandidates;
          if (jsonCandidates > 0) {
            stats.handbookJsonWouldUpdate += 1;
          }
          if (htmlCandidates > 0) {
            stats.handbookHtmlWouldUpdate += 1;
          }
          continue;
        }

        const sourceContextResult = await replaceJsonImageUrls(
          handbook.sourceContext,
          helpers,
          sourceUrl =>
            resolveStorageUrl(sourceUrl, {
              sessionId: session.id,
              handbookSegment: handbook.id,
            }),
        );

        const sourceToolOutputsResult = await replaceJsonImageUrls(
          handbook.sourceToolOutputs,
          helpers,
          sourceUrl =>
            resolveStorageUrl(sourceUrl, {
              sessionId: session.id,
              handbookSegment: handbook.id,
            }),
        );

        const htmlCandidates = collectHtmlCandidateUrls(handbook.html, helpers);
        const htmlUrlMapping = new Map();
        for (const src of htmlCandidates) {
          const nextUrl = await resolveStorageUrl(src, {
            sessionId: session.id,
            handbookSegment: handbook.id,
          });
          htmlUrlMapping.set(src, nextUrl);
        }
        const htmlResult = replaceHtmlWithMappedUrls(handbook.html, helpers, htmlUrlMapping);

        stats.candidateUrlsFound +=
          sourceContextResult.replacedCount
          + sourceToolOutputsResult.replacedCount
          + htmlCandidates.length;
        stats.referencesReplaced +=
          sourceContextResult.replacedCount
          + sourceToolOutputsResult.replacedCount
          + htmlResult.replacedCount;

        const updateData = {};
        let jsonChanged = false;
        if (sourceContextResult.changed) {
          updateData.sourceContext = sourceContextResult.value;
          jsonChanged = true;
        }
        if (sourceToolOutputsResult.changed) {
          updateData.sourceToolOutputs = sourceToolOutputsResult.value;
          jsonChanged = true;
        }
        if (htmlResult.changed) {
          updateData.html = htmlResult.html;
        }

        if (Object.keys(updateData).length > 0) {
          await runDbWithRetry(
            `update handbook ${handbook.id}`,
            () =>
              db.handbook.update({
                where: { id: handbook.id },
                data: updateData,
              }),
          );
        }

        if (jsonChanged) {
          stats.handbookJsonUpdated += 1;
        }
        if (htmlResult.changed) {
          stats.handbookHtmlUpdated += 1;
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          ...stats,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  console.error('[backfill:handbook-images] failed', error);
  process.exit(1);
});
