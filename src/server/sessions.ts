import type { UIMessage } from 'ai';
import {
  Prisma,
} from '@prisma/client';
import db from '@/lib/db';
import {
  HANDBOOK_LIFECYCLE_STATUS,
  SESSION_STATUS,
  type HandbookLifecycleStatusValue,
  type MessageRoleValue,
  type SessionStatusValue,
  type SessionStepStatusValue,
  type SessionToolNameValue,
} from '@/lib/session-enums';
import {
  formatSessionDate,
  resolveSessionTimeValue,
} from '@/lib/session-time';
import {
  LEGACY_SESSION_ANALYSIS_TOOL_NAME,
  SESSION_ANALYSIS_TOOL_NAME,
} from '@/lib/session-analysis-tool';

export type SessionSummaryStatus =
  | 'idle'
  | 'loading'
  | 'error'
  | 'completed'
  | 'cancelled';

export interface SessionSummaryDto {
  id: string;
  title: string;
  description: string | null;
  activeHandbookId: string | null;
  handbookCount: number;
  publicHandbookCount: number;
  meta: string;
  isError: boolean;
  status: SessionSummaryStatus;
  lastStep: string | null;
  startedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PublicSessionSummaryDto {
  id: string;
  title: string;
  description: string | null;
  guidePath: string;
  thumbnailUrl: string | null;
  blocks: unknown;
  handbookVersion: number;
  handbookPublishedAt: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface HandbookSummaryDto {
  id: string;
  sessionId: string;
  title: string;
  lifecycle: HandbookLifecycleStatusValue;
  previewPath: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HandbookDetailDto extends HandbookSummaryDto {
  html: string;
  sourceContext: unknown;
  sourceBlocks: unknown;
  sourceSpotBlocks: unknown;
  sourceToolOutputs: unknown;
  style: string | null;
  thumbnailUrl: string | null;
}

export interface SessionHandbooksDto {
  sessionId: string;
  activeHandbookId: string | null;
  handbooks: HandbookSummaryDto[];
}

export interface SessionDetailDto {
  id: string;
  title: string;
  description: string | null;
  status: SessionStatusValue;
  currentStep: SessionToolNameValue | null;
  failedStep: SessionToolNameValue | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  state: {
    context: unknown;
    blocks: unknown;
    spotBlocks: unknown;
    toolOutputs: unknown;
  } | null;
  steps: Array<{
    id: string;
    toolName: SessionToolNameValue;
    status: SessionStepStatusValue;
    input: unknown;
    output: unknown;
    errorMessage: string | null;
    durationMs: number | null;
    retryCount: number;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  messages: UIMessage[];
}

interface SessionSummaryModel {
  id: string;
  title: string;
  description: string | null;
  activeHandbookId: string | null;
  handbooks: Array<{
    id: string;
    lifecycle: HandbookLifecycleStatusValue;
  }>;
  status: SessionStatusValue;
  currentStep: SessionToolNameValue | null;
  failedStep: SessionToolNameValue | null;
  startedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface HandbookSummaryModel {
  id: string;
  sessionId: string;
  title: string;
  lifecycle: HandbookLifecycleStatusValue;
  previewPath: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface HandbookDetailModel extends HandbookSummaryModel {
  html: string;
  sourceContext: Prisma.JsonValue | null;
  sourceBlocks: Prisma.JsonValue | null;
  sourceSpotBlocks: Prisma.JsonValue | null;
  sourceToolOutputs: Prisma.JsonValue | null;
  style: string | null;
  thumbnailUrl: string | null;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableInputJson(
  value: unknown | undefined,
): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return toInputJson(value);
}

function toMergedNullableInputJson(
  currentValue: unknown,
  nextValue: unknown | undefined,
): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull | undefined {
  if (nextValue === undefined) return undefined;
  if (nextValue === null) return Prisma.JsonNull;
  if (isRecord(currentValue) && isRecord(nextValue)) {
    return toInputJson(mergeJsonValues(currentValue, nextValue));
  }
  return toInputJson(nextValue);
}

function formatStepLabel(step: SessionToolNameValue | null): string {
  if (!step) return 'idle';
  if (step === 'parse_youtube_input') return 'Parse Request';
  if (step === 'crawl_youtube_videos') return 'Crawl Video';
  if (step === LEGACY_SESSION_ANALYSIS_TOOL_NAME) {
    return 'Analyze Session Data';
  }
  if (step === 'resolve_spot_coordinates') return 'Resolve Spots';
  if (step === 'search_image' || step === 'generate_image') return 'Prepare Media';
  return 'Generate Handbook';
}

function toSessionSummaryStatus(status: SessionStatusValue): SessionSummaryStatus {
  if (status === SESSION_STATUS.RUNNING) return 'loading';
  if (status === SESSION_STATUS.ERROR) return 'error';
  if (status === SESSION_STATUS.COMPLETED) return 'completed';
  if (status === SESSION_STATUS.CANCELLED) return 'cancelled';
  return 'idle';
}

function toSessionSummary(model: SessionSummaryModel): SessionSummaryDto {
  const mappedStatus = toSessionSummaryStatus(model.status);
  const sessionTime = resolveSessionTimeValue(model.startedAt, model.createdAt);
  const resolvedActiveHandbookId = model.activeHandbookId ?? model.handbooks[0]?.id ?? null;
  const handbookCount = model.handbooks.length;
  const publicHandbookCount = model.handbooks.filter(
    handbook => handbook.lifecycle === HANDBOOK_LIFECYCLE_STATUS.PUBLIC,
  ).length;
  const meta =
    mappedStatus === 'loading'
      ? formatStepLabel(model.currentStep)
      : mappedStatus === 'error'
        ? 'Error'
        : mappedStatus === 'cancelled'
          ? 'Stopped'
          : sessionTime
            ? formatSessionDate(sessionTime)
            : '-';

  return {
    id: model.id,
    title: model.title,
    description: model.description,
    activeHandbookId: resolvedActiveHandbookId,
    handbookCount,
    publicHandbookCount,
    meta,
    isError: mappedStatus === 'error',
    status: mappedStatus,
    lastStep: (model.failedStep ?? model.currentStep) ?? null,
    startedAt: model.startedAt ? model.startedAt.getTime() : null,
    createdAt: model.createdAt.getTime(),
    updatedAt: model.updatedAt.getTime(),
  };
}

function toHandbookSummary(model: HandbookSummaryModel): HandbookSummaryDto {
  return {
    id: model.id,
    sessionId: model.sessionId,
    title: model.title,
    lifecycle: model.lifecycle,
    previewPath: model.previewPath,
    publishedAt: model.publishedAt ? model.publishedAt.toISOString() : null,
    archivedAt: model.archivedAt ? model.archivedAt.toISOString() : null,
    generatedAt: model.generatedAt ? model.generatedAt.toISOString() : null,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

function toHandbookDetail(model: HandbookDetailModel): HandbookDetailDto {
  return {
    ...toHandbookSummary(model),
    html: model.html,
    sourceContext: model.sourceContext,
    sourceBlocks: model.sourceBlocks,
    sourceSpotBlocks: model.sourceSpotBlocks,
    sourceToolOutputs: model.sourceToolOutputs,
    style: model.style,
    thumbnailUrl: model.thumbnailUrl,
  };
}

function fromMessageRole(role: MessageRoleValue): UIMessage['role'] {
  if (role === 'ASSISTANT') return 'assistant';
  if (role === 'SYSTEM') return 'system';
  return 'user';
}

function normalizeParts(parts: unknown, text: string | null): UIMessage['parts'] {
  if (Array.isArray(parts)) {
    return parts as UIMessage['parts'];
  }
  if (text) {
    return [{ type: 'text', text }];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractThumbnailUrlFromContext(context: unknown): string | null {
  if (!isRecord(context)) return null;

  const nestedVideo = isRecord(context.video) ? context.video : null;
  const nestedVideoThumbnail = readNonEmptyString(nestedVideo?.thumbnailUrl);
  if (nestedVideoThumbnail) return nestedVideoThumbnail;

  const rootThumbnail = readNonEmptyString(context.thumbnailUrl);
  if (rootThumbnail) return rootThumbnail;

  const rawApifyVideos = Array.isArray(context.apifyVideos)
    ? context.apifyVideos
    : Array.isArray(context.apify_videos)
      ? context.apify_videos
      : [];

  for (const item of rawApifyVideos) {
    if (!isRecord(item)) continue;
    const thumbnailUrl = readNonEmptyString(item.thumbnailUrl);
    if (thumbnailUrl) return thumbnailUrl;
  }

  return null;
}

function extractThumbnailUrlFromToolOutputs(toolOutputs: unknown): string | null {
  if (!isRecord(toolOutputs)) return null;

  const resolvedOutput = isRecord(toolOutputs.resolve_spot_coordinates)
    ? toolOutputs.resolve_spot_coordinates
    : null;
  const resolvedThumbnail = readNonEmptyString(resolvedOutput?.thumbnailUrl);
  if (resolvedThumbnail) return resolvedThumbnail;

  const blocksOutput = isRecord(toolOutputs[SESSION_ANALYSIS_TOOL_NAME])
    ? toolOutputs[SESSION_ANALYSIS_TOOL_NAME]
    : isRecord(toolOutputs[LEGACY_SESSION_ANALYSIS_TOOL_NAME])
      ? toolOutputs[LEGACY_SESSION_ANALYSIS_TOOL_NAME]
    : null;
  return readNonEmptyString(blocksOutput?.thumbnailUrl);
}

function extractSessionThumbnailUrl(
  state: {
    context: Prisma.JsonValue | null;
    toolOutputs: Prisma.JsonValue | null;
  } | null,
): string | null {
  if (!state) return null;
  return (
    extractThumbnailUrlFromContext(state.context)
    ?? extractThumbnailUrlFromToolOutputs(state.toolOutputs)
    ?? null
  );
}

function sanitizeStateContextForClient(context: unknown): unknown {
  if (!isRecord(context)) return context ?? null;

  const video = isRecord(context.video) ? context.video : null;
  const handbookStyle =
    typeof context.handbookStyle === 'string' ? context.handbookStyle : null;
  const rawApifyVideos = Array.isArray(context.apifyVideos)
    ? context.apifyVideos
    : Array.isArray(context.apify_videos)
      ? context.apify_videos
      : [];

  const apifyVideos = rawApifyVideos
    .filter(isRecord)
    .map(videoItem => ({
      id: typeof videoItem.id === 'string' ? videoItem.id : '',
      url: typeof videoItem.url === 'string' ? videoItem.url : '',
      title: typeof videoItem.title === 'string' ? videoItem.title : '',
      thumbnailUrl:
        typeof videoItem.thumbnailUrl === 'string' ? videoItem.thumbnailUrl : null,
      location: typeof videoItem.location === 'string' ? videoItem.location : null,
      hashtags: Array.isArray(videoItem.hashtags)
        ? videoItem.hashtags.filter((tag): tag is string => typeof tag === 'string')
        : [],
    }))
    .filter(videoItem => videoItem.id && videoItem.url);

  const rawHandbookImages = Array.isArray(context.handbookImages)
    ? context.handbookImages
    : Array.isArray(context.handbook_images)
      ? context.handbook_images
      : [];
  const sessionAnalysis =
    isRecord(context.sessionAnalysis) ? context.sessionAnalysis
    : isRecord(context.session_analysis) ? context.session_analysis
    : null;
  const handbookImages = rawHandbookImages
    .filter(isRecord)
    .map(image => {
      const source = image.source === 'unsplash' || image.source === 'imagen'
        ? image.source
        : null;
      const rawImageUrl =
        typeof image.image_url === 'string' ? image.image_url.trim() : '';
      return {
        block_id: typeof image.block_id === 'string' ? image.block_id : '',
        block_title: typeof image.block_title === 'string' ? image.block_title : '',
        query: typeof image.query === 'string' ? image.query : '',
        alt: typeof image.alt === 'string' ? image.alt : '',
        image_url: rawImageUrl || null,
        source,
        source_page: typeof image.source_page === 'string' ? image.source_page : null,
        credit: typeof image.credit === 'string' ? image.credit : null,
        width: typeof image.width === 'number' ? image.width : null,
        height: typeof image.height === 'number' ? image.height : null,
      };
    })
    .filter(image => image.block_id && image.image_url);

  return {
    video,
    apifyVideos,
    sessionAnalysis,
    handbookStyle,
    handbookImages,
  };
}

function mergeJsonValues(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return patch;
  return {
    ...base,
    ...patch,
  };
}

function isMissingHandbookLifecycleColumnsError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === 'P2021' || error.code === 'P2022';
}

const handbookSummaryOrderBy: Prisma.HandbookOrderByWithRelationInput[] = [
  { updatedAt: 'desc' },
  { id: 'desc' },
];

const sessionSummarySelect: Prisma.SessionSelect = {
  id: true,
  title: true,
  description: true,
  activeHandbookId: true,
  handbooks: {
    orderBy: handbookSummaryOrderBy,
    select: {
      id: true,
      lifecycle: true,
    },
  },
  status: true,
  currentStep: true,
  failedStep: true,
  startedAt: true,
  createdAt: true,
  updatedAt: true,
};

const legacySessionSummarySelect: Prisma.SessionSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  currentStep: true,
  failedStep: true,
  startedAt: true,
  createdAt: true,
  updatedAt: true,
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

async function ensureUserExists(userId: string): Promise<void> {
  await db.user.upsert({
    where: { id: userId },
    create: { id: userId },
    update: {},
  });
}

async function createSessionSummaryWithLegacyFallback(
  data: Prisma.SessionUncheckedCreateInput,
): Promise<SessionSummaryDto> {
  try {
    const session = await db.session.create({
      data,
      select: sessionSummarySelect,
    });
    return toSessionSummary(session as SessionSummaryModel);
  } catch (error) {
    if (!isMissingHandbookLifecycleColumnsError(error)) throw error;
    const session = await db.session.create({
      data,
      select: legacySessionSummarySelect,
    });
    return toSessionSummary({
      ...session,
      activeHandbookId: null,
      handbooks: [],
    });
  }
}

async function findSessionSummaryForUser(
  userId: string,
  sessionId: string,
): Promise<SessionSummaryModel | null> {
  try {
    return await db.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: sessionSummarySelect,
    });
  } catch (error) {
    if (!isMissingHandbookLifecycleColumnsError(error)) throw error;
    const legacy = await db.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: legacySessionSummarySelect,
    });
    if (!legacy) return null;
    return {
      ...legacy,
      activeHandbookId: null,
      handbooks: [],
    };
  }
}

export async function listSessionSummaries(userId: string): Promise<SessionSummaryDto[]> {
  try {
    const sessions = await db.session.findMany({
      where: { userId },
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
      select: sessionSummarySelect,
    });
    return sessions.map(toSessionSummary);
  } catch (error) {
    if (!isMissingHandbookLifecycleColumnsError(error)) throw error;
    const sessions = await db.session.findMany({
      where: { userId },
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
      select: legacySessionSummarySelect,
    });
    return sessions.map(session =>
      toSessionSummary({
        ...session,
        activeHandbookId: null,
        handbooks: [],
      }),
    );
  }
}

export async function listPublicSessionSummariesByUserId(
  userId: string,
): Promise<PublicSessionSummaryDto[]> {
  const normalizedUserId = userId.trim().slice(0, 128);
  if (!normalizedUserId) return [];

  try {
    const sessions = await db.session.findMany({
      where: {
        userId: normalizedUserId,
      },
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        handbooks: {
          where: { lifecycle: HANDBOOK_LIFECYCLE_STATUS.PUBLIC },
          orderBy: [
            { updatedAt: 'desc' },
            { id: 'desc' },
          ],
          take: 1,
          select: {
            id: true,
            publishedAt: true,
            sourceContext: true,
            sourceToolOutputs: true,
            sourceBlocks: true,
          },
        },
        state: {
          select: {
            context: true,
            toolOutputs: true,
            blocks: true,
            handbookVersion: true,
          },
        },
      },
    });

    return sessions.reduce<PublicSessionSummaryDto[]>((acc, session) => {
        const publicHandbook = session.handbooks[0] ?? null;
        if (!publicHandbook) return acc;

        const thumbnailUrl =
          extractThumbnailUrlFromContext(publicHandbook.sourceContext)
          ?? extractThumbnailUrlFromToolOutputs(publicHandbook.sourceToolOutputs)
          ?? extractThumbnailUrlFromContext(
            isRecord(publicHandbook.sourceBlocks)
              ? publicHandbook.sourceBlocks
              : null,
          )
          ?? extractSessionThumbnailUrl(session.state);
        const blocks = (publicHandbook.sourceBlocks ?? session.state?.blocks ?? []) as unknown;

        acc.push({
          id: session.id,
          title: session.title,
          description: session.description,
          guidePath: `/api/guide/${publicHandbook.id}`,
          thumbnailUrl,
          blocks,
          handbookVersion: 1,
          handbookPublishedAt: publicHandbook.publishedAt
            ? publicHandbook.publishedAt.toISOString()
            : null,
          createdAt: session.createdAt.getTime(),
          updatedAt: session.updatedAt.getTime(),
        });
        return acc;
      }, []);
  } catch (error) {
    if (isMissingHandbookLifecycleColumnsError(error)) return [];
    throw error;
  }
}

export async function createSession(input: {
  userId: string;
  id?: string;
  title?: string;
  description?: string | null;
}): Promise<SessionSummaryDto> {
  const userId = input.userId;
  const title = input.title?.trim() || 'Untitled Guide';
  const description = input.description?.trim() || null;
  await ensureUserExists(userId);

  if (input.id) {
    const updated = await db.session.updateMany({
      where: {
        id: input.id,
        userId,
      },
      data: {
        title,
        description,
      },
    });
    if (updated.count > 0) {
      const existing = await findSessionSummaryForUser(userId, input.id);
      if (existing) return toSessionSummary(existing);
    }

    try {
      return await createSessionSummaryWithLegacyFallback({
        id: input.id,
        userId,
        title,
        description,
        status: SESSION_STATUS.IDLE,
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await findSessionSummaryForUser(userId, input.id);
      if (!existing) {
        throw new Error('Session id is already used by another user.');
      }
      return toSessionSummary(existing);
    }
  }

  return createSessionSummaryWithLegacyFallback({
    userId,
    title,
    description,
    status: SESSION_STATUS.IDLE,
  });
}

export async function ensureSessionRunning(input: {
  userId: string;
  id: string;
  title?: string;
  description?: string | null;
}): Promise<void> {
  const userId = input.userId;
  const title = input.title?.trim() || null;
  const description =
    input.description === undefined ? undefined : input.description?.trim() || null;
  const now = new Date();
  await ensureUserExists(userId);

  const updated = await db.session.updateMany({
    where: {
      id: input.id,
      userId,
    },
    data: {
      title: title ?? undefined,
      description,
      status: SESSION_STATUS.RUNNING,
      failedStep: null,
      lastError: null,
      cancelledAt: null,
      completedAt: null,
    },
  });

  if (updated.count === 0) {
    const existingSession = await db.session.findUnique({
      where: { id: input.id },
      select: { userId: true },
    });
    if (existingSession && existingSession.userId !== userId) {
      throw new SessionOwnershipError();
    }

    try {
      await db.session.create({
        data: {
          id: input.id,
          userId,
          title: title ?? 'Untitled Guide',
          description: description ?? null,
          status: SESSION_STATUS.RUNNING,
          startedAt: now,
          currentStep: null,
          failedStep: null,
          lastError: null,
          completedAt: null,
          cancelledAt: null,
        },
      });
    } catch (error) {
      if (isMissingHandbookLifecycleColumnsError(error)) {
        await db.session.create({
          data: {
            id: input.id,
            userId,
            title: title ?? 'Untitled Guide',
            description: description ?? null,
            status: SESSION_STATUS.RUNNING,
          },
        });
      } else {
        if (!isUniqueConstraintError(error)) throw error;
        const ownedSession = await db.session.findFirst({
          where: {
            id: input.id,
            userId,
          },
          select: { id: true },
        });
        if (!ownedSession) {
          throw new SessionOwnershipError();
        }
      }
    }
  }

  await db.session.updateMany({
    where: {
      id: input.id,
      userId,
      startedAt: null,
    },
    data: {
      startedAt: now,
    },
  });
}

export async function updateSessionPartial(
  sessionId: string,
  userId: string,
  updates: {
    title?: string;
    description?: string | null;
    status?: SessionStatusValue;
    currentStep?: SessionToolNameValue | null;
    failedStep?: SessionToolNameValue | null;
    lastError?: string | null;
  },
): Promise<SessionSummaryDto | null> {
  const updated = await db.session.updateMany({
    where: {
      id: sessionId,
      userId,
    },
    data: {
      title: updates.title?.trim() || undefined,
      description:
        updates.description === undefined
          ? undefined
          : updates.description?.trim() || null,
      status: updates.status,
      currentStep: updates.currentStep,
      failedStep: updates.failedStep,
      lastError:
        updates.lastError === undefined ? undefined : updates.lastError || null,
    },
  });
  if (updated.count === 0) return null;

  const session = await findSessionSummaryForUser(userId, sessionId);
  return session ? toSessionSummary(session) : null;
}

export async function removeSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await db.session.deleteMany({
    where: {
      id: sessionId,
      userId,
    },
  });
  return result.count > 0;
}

async function findOwnedHandbook(
  handbookId: string,
  userId: string,
): Promise<HandbookDetailModel | null> {
  return db.handbook.findFirst({
    where: {
      id: handbookId,
      session: {
        userId,
      },
    },
    select: {
      id: true,
      sessionId: true,
      title: true,
      lifecycle: true,
      previewPath: true,
      publishedAt: true,
      archivedAt: true,
      generatedAt: true,
      createdAt: true,
      updatedAt: true,
      html: true,
      sourceContext: true,
      sourceBlocks: true,
      sourceSpotBlocks: true,
      sourceToolOutputs: true,
      style: true,
      thumbnailUrl: true,
    },
  });
}

export async function listSessionHandbooks(
  sessionId: string,
  userId: string,
): Promise<SessionHandbooksDto | null> {
  let session: {
    id: string;
    activeHandbookId: string | null;
    handbooks: HandbookSummaryModel[];
  } | null = null;
  try {
    session = await db.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: {
        id: true,
        activeHandbookId: true,
        handbooks: {
          orderBy: [
            { updatedAt: 'desc' },
            { id: 'desc' },
          ],
          select: {
            id: true,
            sessionId: true,
            title: true,
            lifecycle: true,
            previewPath: true,
            publishedAt: true,
            archivedAt: true,
            generatedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  } catch (error) {
    if (!isMissingHandbookLifecycleColumnsError(error)) throw error;
    const owner = await db.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: { id: true },
    });
    if (!owner) return null;
    return {
      sessionId: owner.id,
      activeHandbookId: null,
      handbooks: [],
    };
  }
  if (!session) return null;

  return {
    sessionId: session.id,
    activeHandbookId: session.activeHandbookId,
    handbooks: session.handbooks.map(toHandbookSummary),
  };
}

export async function createSessionHandbook(
  sessionId: string,
  userId: string,
  input: {
    title?: string;
    html: string;
    lifecycle?: HandbookLifecycleStatusValue;
    previewPath?: string | null;
    sourceContext?: unknown;
    sourceBlocks?: unknown;
    sourceSpotBlocks?: unknown;
    sourceToolOutputs?: unknown;
    style?: string | null;
    thumbnailUrl?: string | null;
    generatedAt?: Date | null;
    setActive?: boolean;
  },
): Promise<HandbookDetailDto | null> {
  const session = await db.session.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!session) return null;

  const title = input.title?.trim() || 'Untitled Handbook';
  const html = input.html.trim();
  if (!html) return null;
  const lifecycle = input.lifecycle ?? HANDBOOK_LIFECYCLE_STATUS.DRAFT;

  const now = new Date();
  const created = await db.handbook.create({
    data: {
      sessionId,
      title,
      html,
      lifecycle,
      previewPath: input.previewPath ?? null,
      sourceContext: toNullableInputJson(input.sourceContext),
      sourceBlocks: toNullableInputJson(input.sourceBlocks),
      sourceSpotBlocks: toNullableInputJson(input.sourceSpotBlocks),
      sourceToolOutputs: toNullableInputJson(input.sourceToolOutputs),
      style: input.style ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      generatedAt: input.generatedAt ?? null,
      publishedAt: lifecycle === HANDBOOK_LIFECYCLE_STATUS.PUBLIC ? now : null,
      archivedAt: lifecycle === HANDBOOK_LIFECYCLE_STATUS.ARCHIVED ? now : null,
    },
    select: {
      id: true,
      sessionId: true,
      title: true,
      lifecycle: true,
      previewPath: true,
      publishedAt: true,
      archivedAt: true,
      generatedAt: true,
      createdAt: true,
      updatedAt: true,
      html: true,
      sourceContext: true,
      sourceBlocks: true,
      sourceSpotBlocks: true,
      sourceToolOutputs: true,
      style: true,
      thumbnailUrl: true,
    },
  });

  const shouldSetActive = input.setActive ?? true;
  if (shouldSetActive) {
    await db.session.updateMany({
      where: { id: sessionId, userId },
      data: { activeHandbookId: created.id },
    });
  }

  return toHandbookDetail(created);
}

export async function updateSessionHandbook(
  handbookId: string,
  userId: string,
  updates: {
    title?: string;
    html?: string;
    previewPath?: string | null;
    sourceContext?: unknown;
    sourceBlocks?: unknown;
    sourceSpotBlocks?: unknown;
    sourceToolOutputs?: unknown;
    style?: string | null;
    thumbnailUrl?: string | null;
    generatedAt?: Date | null;
  },
): Promise<HandbookDetailDto | null> {
  const existing = await findOwnedHandbook(handbookId, userId);
  if (!existing) return null;

  await db.handbook.update({
    where: { id: handbookId },
    data: {
      title: updates.title?.trim() || undefined,
      html: updates.html === undefined ? undefined : updates.html.trim(),
      previewPath: updates.previewPath === undefined ? undefined : updates.previewPath,
      sourceContext: toMergedNullableInputJson(existing.sourceContext, updates.sourceContext),
      sourceBlocks: toNullableInputJson(updates.sourceBlocks),
      sourceSpotBlocks: toNullableInputJson(updates.sourceSpotBlocks),
      sourceToolOutputs: toNullableInputJson(updates.sourceToolOutputs),
      style: updates.style === undefined ? undefined : updates.style,
      thumbnailUrl: updates.thumbnailUrl === undefined ? undefined : updates.thumbnailUrl,
      generatedAt: updates.generatedAt === undefined ? undefined : updates.generatedAt,
    },
  });

  const updated = await findOwnedHandbook(handbookId, userId);
  return updated ? toHandbookDetail(updated) : null;
}

export async function setHandbookLifecycle(
  handbookId: string,
  userId: string,
  lifecycle: HandbookLifecycleStatusValue,
): Promise<{
  handbookId: string;
  lifecycle: HandbookLifecycleStatusValue;
  publishedAt: string | null;
  archivedAt: string | null;
} | null> {
  const existing = await findOwnedHandbook(handbookId, userId);
  if (!existing) return null;

  if (lifecycle === HANDBOOK_LIFECYCLE_STATUS.PUBLIC) {
    const html = existing.html?.trim();
    if (!html) {
      throw new HandbookLifecycleError(
        'Cannot set handbook lifecycle to PUBLIC before handbook HTML is generated.',
        'MISSING_HTML_FOR_PUBLIC',
      );
    }
  }

  const now = new Date();
  await db.handbook.update({
    where: { id: handbookId },
    data: {
      lifecycle,
      publishedAt: lifecycle === HANDBOOK_LIFECYCLE_STATUS.PUBLIC ? now : null,
      archivedAt: lifecycle === HANDBOOK_LIFECYCLE_STATUS.ARCHIVED ? now : null,
    },
  });

  const updated = await db.handbook.findUnique({
    where: { id: handbookId },
    select: {
      id: true,
      lifecycle: true,
      publishedAt: true,
      archivedAt: true,
    },
  });
  if (!updated) return null;

  return {
    handbookId: updated.id,
    lifecycle: updated.lifecycle,
    publishedAt: updated.publishedAt ? updated.publishedAt.toISOString() : null,
    archivedAt: updated.archivedAt ? updated.archivedAt.toISOString() : null,
  };
}

export async function setActiveHandbook(
  sessionId: string,
  userId: string,
  handbookId: string,
): Promise<boolean> {
  const handbook = await db.handbook.findFirst({
    where: {
      id: handbookId,
      sessionId,
      session: { userId },
    },
    select: { id: true },
  });
  if (!handbook) return false;

  const updated = await db.session.updateMany({
    where: { id: sessionId, userId },
    data: { activeHandbookId: handbookId },
  });
  return updated.count > 0;
}

export async function removeSessionHandbook(
  handbookId: string,
  userId: string,
): Promise<boolean> {
  const existing = await db.handbook.findFirst({
    where: {
      id: handbookId,
      session: { userId },
    },
    select: {
      id: true,
      sessionId: true,
      session: {
        select: {
          activeHandbookId: true,
        },
      },
    },
  });
  if (!existing) return false;

  await db.handbook.delete({
    where: { id: handbookId },
  });

  if (existing.session.activeHandbookId === handbookId) {
    const fallback = await db.handbook.findFirst({
      where: { sessionId: existing.sessionId },
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
      select: { id: true },
    });

    await db.session.update({
      where: { id: existing.sessionId },
      data: { activeHandbookId: fallback?.id ?? null },
    });
  }

  return true;
}

export async function getSessionDetail(
  sessionId: string,
  userId: string,
): Promise<SessionDetailDto | null> {
  let session: {
    id: string;
    title: string;
    description: string | null;
    status: SessionStatusValue;
    currentStep: SessionToolNameValue | null;
    failedStep: SessionToolNameValue | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
    state: {
      context: Prisma.JsonValue | null;
      blocks: Prisma.JsonValue | null;
      spotBlocks: Prisma.JsonValue | null;
      toolOutputs: Prisma.JsonValue | null;
    } | null;
    steps: Array<{
      id: string;
      toolName: SessionToolNameValue;
      status: SessionStepStatusValue;
      input: Prisma.JsonValue | null;
      output: Prisma.JsonValue | null;
      errorMessage: string | null;
      durationMs: number | null;
      retryCount: number;
      startedAt: Date | null;
      finishedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    messages: Array<{
      externalId: string;
      role: MessageRoleValue;
      parts: Prisma.JsonValue | null;
      text: string | null;
    }>;
  } | null = null;

  try {
    session = await db.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        currentStep: true,
        failedStep: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        state: {
          select: {
            context: true,
            blocks: true,
            spotBlocks: true,
            toolOutputs: true,
          },
        },
        steps: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            toolName: true,
            status: true,
            input: true,
            output: true,
            errorMessage: true,
            durationMs: true,
            retryCount: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        messages: {
          orderBy: { seq: 'asc' },
          select: {
            externalId: true,
            role: true,
            parts: true,
            text: true,
          },
        },
      },
    });
  } catch (error) {
    if (!isMissingHandbookLifecycleColumnsError(error)) throw error;
    session = await db.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        currentStep: true,
        failedStep: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        state: {
          select: {
            context: true,
            blocks: true,
            spotBlocks: true,
            toolOutputs: true,
          },
        },
        steps: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            toolName: true,
            status: true,
            input: true,
            output: true,
            errorMessage: true,
            durationMs: true,
            retryCount: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        messages: {
          orderBy: { seq: 'asc' },
          select: {
            externalId: true,
            role: true,
            parts: true,
            text: true,
          },
        },
      },
    });
  }

  if (!session) return null;

  return {
    id: session.id,
    title: session.title,
    description: session.description,
    status: session.status,
    currentStep: session.currentStep,
    failedStep: session.failedStep,
    lastError: session.lastError,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    state: session.state
      ? {
          context: sanitizeStateContextForClient(session.state.context),
          blocks: session.state.blocks,
          spotBlocks: session.state.spotBlocks,
          toolOutputs: session.state.toolOutputs,
        }
      : null,
    steps: session.steps.map(step => ({
      id: step.id,
      toolName: step.toolName,
      status: step.status,
      input: step.input,
      output: step.output,
      errorMessage: step.errorMessage,
      durationMs: step.durationMs,
      retryCount: step.retryCount,
      startedAt: step.startedAt ? step.startedAt.toISOString() : null,
      finishedAt: step.finishedAt ? step.finishedAt.toISOString() : null,
      createdAt: step.createdAt.toISOString(),
      updatedAt: step.updatedAt.toISOString(),
    })),
    messages: session.messages.map(message => ({
      id: message.externalId,
      role: fromMessageRole(message.role),
      parts: normalizeParts(message.parts, message.text),
    })),
  };
}

export async function getSessionStatus(
  sessionId: string,
  userId: string,
): Promise<SessionStatusValue | null> {
  const session = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: { status: true },
  });
  return session?.status ?? null;
}

export class SessionOwnershipError extends Error {
  constructor() {
    super('Session not found for current user.');
    this.name = 'SessionOwnershipError';
  }
}

export function isSessionOwnershipError(error: unknown): error is SessionOwnershipError {
  return error instanceof SessionOwnershipError;
}

export interface SessionStateSnapshot {
  context: unknown;
  blocks: unknown;
  spotBlocks: unknown;
  toolOutputs: unknown;
}

export async function getSessionStateSnapshot(
  sessionId: string,
  userId: string,
): Promise<SessionStateSnapshot | null> {
  let state: {
    context: Prisma.JsonValue | null;
    blocks: Prisma.JsonValue | null;
    spotBlocks: Prisma.JsonValue | null;
    toolOutputs: Prisma.JsonValue | null;
  } | null = null;
  state = await db.sessionState.findFirst({
    where: {
      sessionId,
      session: {
        userId,
      },
    },
    select: {
      context: true,
      blocks: true,
      spotBlocks: true,
      toolOutputs: true,
    },
  });

  if (!state) return null;

  return {
    context: state.context,
    blocks: state.blocks,
    spotBlocks: state.spotBlocks,
    toolOutputs: state.toolOutputs,
  };
}

export async function upsertSessionState(
  sessionId: string,
  userId: string,
  state: {
    context?: unknown;
    blocks?: unknown;
    spotBlocks?: unknown;
    toolOutputs?: unknown;
  },
): Promise<void> {
  const ownedSession = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: { id: true },
  });
  if (!ownedSession) return;

  await db.sessionState.upsert({
    where: { sessionId },
    create: {
      sessionId,
      context: toNullableInputJson(state.context),
      blocks: toNullableInputJson(state.blocks),
      spotBlocks: toNullableInputJson(state.spotBlocks),
      toolOutputs: toNullableInputJson(state.toolOutputs),
    },
    update: {
      context: toNullableInputJson(state.context),
      blocks: toNullableInputJson(state.blocks),
      spotBlocks: toNullableInputJson(state.spotBlocks),
      toolOutputs: toNullableInputJson(state.toolOutputs),
    },
  });
}

export async function patchSessionState(
  sessionId: string,
  userId: string,
  state: {
    context?: unknown;
    blocks?: unknown;
    spotBlocks?: unknown;
    toolOutputs?: unknown;
  },
): Promise<void> {
  const existing = await getSessionStateSnapshot(sessionId, userId);

  const mergedContext =
    state.context === undefined
      ? undefined
      : mergeJsonValues(existing?.context, state.context);
  const mergedToolOutputs =
    state.toolOutputs === undefined
      ? undefined
      : mergeJsonValues(existing?.toolOutputs, state.toolOutputs);

  await upsertSessionState(sessionId, userId, {
    ...state,
    context: mergedContext,
    toolOutputs: mergedToolOutputs,
  });
}

export class HandbookLifecycleError extends Error {
  code: 'MISSING_HTML_FOR_PUBLIC';

  constructor(message: string, code: 'MISSING_HTML_FOR_PUBLIC') {
    super(message);
    this.code = code;
  }
}

export async function setSessionHandbookLifecycle(
  sessionId: string,
  userId: string,
  lifecycle: HandbookLifecycleStatusValue,
): Promise<{
  handbookLifecycle: HandbookLifecycleStatusValue;
  handbookPublishedAt: string | null;
  handbookArchivedAt: string | null;
} | null> {
  const handbookTarget = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      activeHandbookId: true,
      handbooks: {
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!handbookTarget) return null;

  const handbookId = handbookTarget.activeHandbookId ?? handbookTarget.handbooks[0]?.id ?? null;
  if (!handbookId) return null;

  const updated = await setHandbookLifecycle(handbookId, userId, lifecycle);
  if (!updated) return null;

  return {
    handbookLifecycle: updated.lifecycle,
    handbookPublishedAt: updated.publishedAt,
    handbookArchivedAt: updated.archivedAt,
  };
}

export async function getSessionHandbook(
  sessionId: string,
  userId: string,
): Promise<{
  title: string;
  html: string;
  handbookVersion: number;
} | null> {
  const sessionWithHandbook = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      title: true,
      activeHandbook: {
        select: {
          title: true,
          html: true,
        },
      },
      handbooks: {
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
        take: 1,
        select: {
          title: true,
          html: true,
        },
      },
      state: {
        select: {
          handbookHtml: true,
          handbookVersion: true,
        },
      },
    },
  });
  if (!sessionWithHandbook) return null;

  const handbook = sessionWithHandbook.activeHandbook ?? sessionWithHandbook.handbooks[0] ?? null;
  if (handbook?.html) {
    return {
      title: handbook.title || sessionWithHandbook.title,
      html: handbook.html,
      handbookVersion: 1,
    };
  }

  // Legacy fallback.
  if (!sessionWithHandbook.state?.handbookHtml) return null;
  return {
    title: sessionWithHandbook.title,
    html: sessionWithHandbook.state.handbookHtml,
    handbookVersion: sessionWithHandbook.state.handbookVersion,
  };
}

export async function getSessionHandbookById(
  id: string,
): Promise<{
  title: string;
  html: string;
  handbookVersion: number;
} | null> {
  const handbookById = await db.handbook.findUnique({
    where: { id },
    select: {
      title: true,
      html: true,
    },
  });
  if (handbookById?.html) {
    return {
      title: handbookById.title,
      html: handbookById.html,
      handbookVersion: 1,
    };
  }

  // Backward compatibility: if caller still passes sessionId, resolve active handbook first.
  const session = await db.session.findFirst({
    where: {
      id,
    },
    select: {
      title: true,
      activeHandbook: {
        select: {
          title: true,
          html: true,
        },
      },
      handbooks: {
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
        take: 1,
        select: {
          title: true,
          html: true,
        },
      },
      state: {
        select: {
          handbookHtml: true,
          handbookVersion: true,
        },
      },
    },
  });

  if (!session) return null;
  const active = session.activeHandbook ?? session.handbooks[0] ?? null;
  if (active?.html) {
    return {
      title: active.title || session.title,
      html: active.html,
      handbookVersion: 1,
    };
  }

  if (!session.state?.handbookHtml) return null;
  return {
    title: session.title,
    html: session.state.handbookHtml,
    handbookVersion: session.state.handbookVersion,
  };
}

export async function getPublicSessionHandbook(
  id: string,
): Promise<{
  title: string;
  html: string;
  handbookVersion: number;
} | null> {
  const handbook = await db.handbook.findFirst({
    where: {
      id,
      lifecycle: HANDBOOK_LIFECYCLE_STATUS.PUBLIC,
    },
    select: {
      title: true,
      html: true,
    },
  });
  if (handbook?.html) {
    return {
      title: handbook.title,
      html: handbook.html,
      handbookVersion: 1,
    };
  }

  // Backward compatibility: old public route may still pass sessionId.
  const sessionWithPublicHandbook = await db.session.findFirst({
    where: { id },
    select: {
      title: true,
      activeHandbook: {
        select: {
          title: true,
          html: true,
          lifecycle: true,
        },
      },
      handbooks: {
        where: { lifecycle: HANDBOOK_LIFECYCLE_STATUS.PUBLIC },
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
        take: 1,
        select: {
          title: true,
          html: true,
        },
      },
    },
  });
  if (!sessionWithPublicHandbook) return null;

  if (
    sessionWithPublicHandbook.activeHandbook?.lifecycle === HANDBOOK_LIFECYCLE_STATUS.PUBLIC
    && sessionWithPublicHandbook.activeHandbook.html
  ) {
    return {
      title: sessionWithPublicHandbook.activeHandbook.title || sessionWithPublicHandbook.title,
      html: sessionWithPublicHandbook.activeHandbook.html,
      handbookVersion: 1,
    };
  }

  if (sessionWithPublicHandbook.handbooks[0]?.html) {
    return {
      title: sessionWithPublicHandbook.handbooks[0].title || sessionWithPublicHandbook.title,
      html: sessionWithPublicHandbook.handbooks[0].html,
      handbookVersion: 1,
    };
  }
  return null;
}
