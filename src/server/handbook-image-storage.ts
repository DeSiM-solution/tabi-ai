import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StorageError } from '@supabase/storage-js';
import { toErrorMessage } from '@/agent/context/utils';
import type { HandbookImageAsset } from '@/agent/tools/types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'handbook';

const FALLBACK_RUNTIME_SEGMENT = 'runtime';
const FALLBACK_EXTENSION = 'bin';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

const CONTENT_TYPE_EXTENSION_MAP: Record<string, string> = {
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

type MaterializedImage = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

export type UploadFailureMode = 'fail-fast' | 'skip-failed';

export type NormalizeHandbookImagesResult = {
  images: HandbookImageAsset[];
  uploadedCount: number;
  reusedCount: number;
  skippedCount: number;
  failures: Array<{
    blockId: string;
    message: string;
  }>;
};

let cachedSupabaseClient: SupabaseClient | null = null;

function sanitizePathSegment(input: string | null | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw) return FALLBACK_RUNTIME_SEGMENT;
  return raw
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || FALLBACK_RUNTIME_SEGMENT;
}

function getRuntimeSegment(handbookId: string | null | undefined): string {
  const raw = (handbookId ?? '').trim();
  if (raw) return sanitizePathSegment(raw);
  return `runtime-${Date.now()}`;
}

function normalizeContentType(input: string | null): string {
  if (!input) return DEFAULT_CONTENT_TYPE;
  const normalized = input.split(';')[0]?.trim().toLowerCase();
  return normalized || DEFAULT_CONTENT_TYPE;
}

function getExtensionFromContentType(contentType: string): string {
  return CONTENT_TYPE_EXTENSION_MAP[contentType] ?? FALLBACK_EXTENSION;
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

function parseDataUrl(dataUrl: string): MaterializedImage {
  const separator = dataUrl.indexOf(',');
  if (separator < 0) {
    throw new Error('Invalid data URL: missing comma separator.');
  }

  const metadata = dataUrl.slice(5, separator);
  const payload = dataUrl.slice(separator + 1);
  const isBase64 = metadata.split(';').some(token => token.toLowerCase() === 'base64');
  const rawType = metadata.split(';')[0] ?? '';
  const contentType = normalizeContentType(rawType || null);
  const extension = getExtensionFromContentType(contentType);

  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf-8');

  if (buffer.length === 0) {
    throw new Error('Invalid data URL: empty payload.');
  }

  return { buffer, contentType, extension };
}

async function fetchRemoteImage(url: string): Promise<MaterializedImage> {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}) for ${url}`);
  }

  const contentType = normalizeContentType(response.headers.get('content-type'));
  const extension = getExtensionFromContentType(contentType);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    throw new Error(`Image download returned empty body for ${url}`);
  }

  return { buffer, contentType, extension };
}

async function materializeImageSource(urlOrDataUrl: string): Promise<MaterializedImage> {
  if (isDataUrl(urlOrDataUrl)) {
    return parseDataUrl(urlOrDataUrl);
  }
  if (isRemoteUrl(urlOrDataUrl)) {
    return fetchRemoteImage(urlOrDataUrl);
  }
  throw new Error('Unsupported image source. Only data URL and http(s) URL are allowed.');
}

function getSupabaseClient(): SupabaseClient {
  if (cachedSupabaseClient) return cachedSupabaseClient;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  cachedSupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return cachedSupabaseClient;
}

function isObjectAlreadyExistsError(error: StorageError): boolean {
  const message = error.message.toLowerCase();
  const statusCode = typeof error.statusCode === 'string' ? error.statusCode : '';
  return (
    statusCode === '409'
    || message.includes('already exists')
    || message.includes('duplicate')
    || message.includes('resource already exists')
  );
}

function buildObjectPath(input: {
  sessionId: string | null | undefined;
  runtimeSegment: string;
  extension: string;
  sha1: string;
}): string {
  const sessionSegment = sanitizePathSegment(input.sessionId);
  const extension = (input.extension || FALLBACK_EXTENSION).toLowerCase();
  return `handbooks/${sessionSegment}/${input.runtimeSegment}/${input.sha1}.${extension}`;
}

export function isSupabaseStorageUrl(url: string): boolean {
  if (!SUPABASE_URL || !url) return false;
  try {
    const parsedSource = new URL(url);
    const parsedSupabase = new URL(SUPABASE_URL);
    const expectedPathPrefix = `/storage/v1/object/public/${SUPABASE_BUCKET}/`;
    return (
      parsedSource.origin === parsedSupabase.origin
      && parsedSource.pathname.startsWith(expectedPathPrefix)
    );
  } catch {
    return false;
  }
}

async function uploadMaterializedImage(input: {
  path: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const client = getSupabaseClient();
  const bucket = client.storage.from(SUPABASE_BUCKET);

  const { error } = await bucket.upload(input.path, input.buffer, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error && !isObjectAlreadyExistsError(error)) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = bucket.getPublicUrl(input.path);
  if (!data?.publicUrl) {
    throw new Error(`Failed to build public URL for ${input.path}`);
  }
  return data.publicUrl;
}

export async function normalizeHandbookImagesToStorage(input: {
  images: HandbookImageAsset[];
  sessionId: string | null | undefined;
  handbookId: string | null | undefined;
  failureMode?: UploadFailureMode;
}): Promise<NormalizeHandbookImagesResult> {
  const failureMode = input.failureMode ?? 'skip-failed';
  const rewrittenImages: HandbookImageAsset[] = [];
  const sourceUrlMap = new Map<string, string>();
  const runtimeSegment = getRuntimeSegment(input.handbookId);
  let uploadedCount = 0;
  let reusedCount = 0;
  let skippedCount = 0;
  const failures: Array<{ blockId: string; message: string }> = [];

  for (const image of input.images) {
    const sourceUrl = image.image_url.trim();
    if (!sourceUrl) {
      const message = `Image URL is empty for block ${image.block_id}`;
      if (failureMode === 'fail-fast') throw new Error(message);
      skippedCount += 1;
      failures.push({ blockId: image.block_id, message });
      continue;
    }

    if (isSupabaseStorageUrl(sourceUrl)) {
      rewrittenImages.push(image);
      reusedCount += 1;
      continue;
    }

    const reusedSource = sourceUrlMap.get(sourceUrl);
    if (reusedSource) {
      rewrittenImages.push({
        ...image,
        image_url: reusedSource,
      });
      reusedCount += 1;
      continue;
    }

    try {
      const materialized = await materializeImageSource(sourceUrl);
      const sha1 = createHash('sha1').update(materialized.buffer).digest('hex');
      const extension = materialized.extension || FALLBACK_EXTENSION;
      const objectPath = buildObjectPath({
        sessionId: input.sessionId,
        runtimeSegment,
        extension,
        sha1,
      });
      const publicUrl = await uploadMaterializedImage({
        path: objectPath,
        buffer: materialized.buffer,
        contentType: materialized.contentType,
      });

      sourceUrlMap.set(sourceUrl, publicUrl);
      rewrittenImages.push({
        ...image,
        image_url: publicUrl,
      });
      uploadedCount += 1;
    } catch (error) {
      const message = toErrorMessage(error);
      if (failureMode === 'fail-fast') {
        throw new Error(
          `Failed to upload image for block ${image.block_id}: ${message}`,
        );
      }
      failures.push({ blockId: image.block_id, message });
      skippedCount += 1;
      rewrittenImages.push(image);
    }
  }

  return {
    images: rewrittenImages,
    uploadedCount,
    reusedCount,
    skippedCount,
    failures,
  };
}
