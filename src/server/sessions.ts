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
  handbookLifecycle: HandbookLifecycleStatusValue;
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
    handbookHtml: string | null;
    handbookLifecycle: HandbookLifecycleStatusValue;
    handbookPublishedAt: string | null;
    handbookArchivedAt: string | null;
    handbookVersion: number;
    handbookGeneratedAt: string | null;
    previewPath: string | null;
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
  state: {
    handbookLifecycle: HandbookLifecycleStatusValue;
  } | null;
  status: SessionStatusValue;
  currentStep: SessionToolNameValue | null;
  failedStep: SessionToolNameValue | null;
  startedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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

function formatStepLabel(step: SessionToolNameValue | null): string {
  if (!step) return 'idle';
  if (step === 'parse_youtube_input') return 'Parse URL';
  if (step === 'crawl_youtube_videos') return 'Crawl Video';
  if (step === 'build_travel_blocks') return 'Build Blocks';
  if (step === 'resolve_spot_coordinates') return 'Resolve Coordinates';
  if (step === 'search_image') return 'Search Images';
  if (step === 'generate_image') return 'Generate Images';
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
    handbookLifecycle: model.state?.handbookLifecycle ?? HANDBOOK_LIFECYCLE_STATUS.DRAFT,
    meta,
    isError: mappedStatus === 'error',
    status: mappedStatus,
    lastStep: (model.failedStep ?? model.currentStep) ?? null,
    startedAt: model.startedAt ? model.startedAt.getTime() : null,
    createdAt: model.createdAt.getTime(),
    updatedAt: model.updatedAt.getTime(),
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

  const blocksOutput = isRecord(toolOutputs.build_travel_blocks)
    ? toolOutputs.build_travel_blocks
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

  return {
    video,
    apifyVideos,
    handbookStyle,
  };
}

function getHandbookHtmlForClient(
  handbookHtml: string | null,
): string | null {
  if (!handbookHtml) return null;
  const maxCharsRaw = Number(process.env.SESSION_DETAIL_MAX_HANDBOOK_HTML_CHARS ?? 250_000);
  const maxChars =
    Number.isFinite(maxCharsRaw) && maxCharsRaw > 0 ? Math.floor(maxCharsRaw) : 250_000;
  return handbookHtml.length <= maxChars ? handbookHtml : null;
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
  if (error.code !== 'P2021' && error.code !== 'P2022') return false;
  const message = error.message || '';
  return (
    message.includes('handbookLifecycle')
    || message.includes('handbookPublishedAt')
    || message.includes('handbookArchivedAt')
  );
}

const sessionSummarySelect = {
  id: true,
  title: true,
  description: true,
  state: {
    select: {
      handbookLifecycle: true,
    },
  },
  status: true,
  currentStep: true,
  failedStep: true,
  startedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const legacySessionSummarySelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  currentStep: true,
  failedStep: true,
  startedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
      state: null,
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
        state: null,
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
        state: {
          is: {
            handbookLifecycle: HANDBOOK_LIFECYCLE_STATUS.PUBLIC,
            handbookHtml: {
              not: null,
            },
          },
        },
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
        state: {
          select: {
            context: true,
            toolOutputs: true,
            blocks: true,
            handbookVersion: true,
            handbookPublishedAt: true,
          },
        },
      },
    });

    return sessions.map(session => ({
      id: session.id,
      title: session.title,
      description: session.description,
      guidePath: `/api/guide/${session.id}`,
      thumbnailUrl: extractSessionThumbnailUrl(session.state),
      blocks: session.state?.blocks ?? [],
      handbookVersion: session.state?.handbookVersion ?? 0,
      handbookPublishedAt: session.state?.handbookPublishedAt?.toISOString() ?? null,
      createdAt: session.createdAt.getTime(),
      updatedAt: session.updatedAt.getTime(),
    }));
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
      const session = await db.session.create({
        data: {
          id: input.id,
          userId,
          title,
          description,
          status: SESSION_STATUS.IDLE,
        },
        select: sessionSummarySelect,
      });
      return toSessionSummary(session);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await findSessionSummaryForUser(userId, input.id);
      if (!existing) {
        throw new Error('Session id is already used by another user.');
      }
      return toSessionSummary(existing);
    }
  }

  const session = await db.session.create({
    data: {
      userId,
      title,
      description,
      status: SESSION_STATUS.IDLE,
    },
    select: sessionSummarySelect,
  });

  return toSessionSummary(session);
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
      if (!isUniqueConstraintError(error)) throw error;
      throw new Error('Session not found for current user.');
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

export async function getSessionDetail(
  sessionId: string,
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
      handbookHtml: string | null;
      handbookLifecycle?: HandbookLifecycleStatusValue;
      handbookPublishedAt?: Date | null;
      handbookArchivedAt?: Date | null;
      handbookVersion: number;
      handbookGeneratedAt: Date | null;
      previewPath: string | null;
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
      },
      include: {
        state: true,
        steps: {
          orderBy: { createdAt: 'asc' },
        },
        messages: {
          orderBy: { seq: 'asc' },
        },
      },
    });
  } catch (error) {
    if (!isMissingHandbookLifecycleColumnsError(error)) throw error;
    session = await db.session.findFirst({
      where: {
        id: sessionId,
      },
      include: {
        state: {
          select: {
            context: true,
            blocks: true,
            spotBlocks: true,
            toolOutputs: true,
            handbookHtml: true,
            handbookVersion: true,
            handbookGeneratedAt: true,
            previewPath: true,
          },
        },
        steps: {
          orderBy: { createdAt: 'asc' },
        },
        messages: {
          orderBy: { seq: 'asc' },
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
          handbookHtml: getHandbookHtmlForClient(session.state.handbookHtml),
          handbookLifecycle:
            session.state.handbookLifecycle ?? HANDBOOK_LIFECYCLE_STATUS.DRAFT,
          handbookPublishedAt: session.state.handbookPublishedAt
            ? session.state.handbookPublishedAt.toISOString()
            : null,
          handbookArchivedAt: session.state.handbookArchivedAt
            ? session.state.handbookArchivedAt.toISOString()
            : null,
          handbookVersion: session.state.handbookVersion,
          handbookGeneratedAt: session.state.handbookGeneratedAt
            ? session.state.handbookGeneratedAt.toISOString()
            : null,
          previewPath: session.state.previewPath,
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

export interface SessionStateSnapshot {
  context: unknown;
  blocks: unknown;
  spotBlocks: unknown;
  toolOutputs: unknown;
  handbookHtml: string | null;
  handbookLifecycle: HandbookLifecycleStatusValue;
  handbookPublishedAt: string | null;
  handbookArchivedAt: string | null;
  handbookVersion: number;
  handbookGeneratedAt: string | null;
  previewPath: string | null;
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
    handbookHtml: string | null;
    handbookLifecycle?: HandbookLifecycleStatusValue;
    handbookPublishedAt?: Date | null;
    handbookArchivedAt?: Date | null;
    handbookVersion: number;
    handbookGeneratedAt: Date | null;
    previewPath: string | null;
  } | null = null;

  try {
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
        handbookHtml: true,
        handbookLifecycle: true,
        handbookPublishedAt: true,
        handbookArchivedAt: true,
        handbookVersion: true,
        handbookGeneratedAt: true,
        previewPath: true,
      },
    });
  } catch (error) {
    if (!isMissingHandbookLifecycleColumnsError(error)) throw error;
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
        handbookHtml: true,
        handbookVersion: true,
        handbookGeneratedAt: true,
        previewPath: true,
      },
    });
  }

  if (!state) return null;

  return {
    context: state.context,
    blocks: state.blocks,
    spotBlocks: state.spotBlocks,
    toolOutputs: state.toolOutputs,
    handbookHtml: state.handbookHtml,
    handbookLifecycle: state.handbookLifecycle ?? HANDBOOK_LIFECYCLE_STATUS.DRAFT,
    handbookPublishedAt: state.handbookPublishedAt
      ? state.handbookPublishedAt.toISOString()
      : null,
    handbookArchivedAt: state.handbookArchivedAt
      ? state.handbookArchivedAt.toISOString()
      : null,
    handbookVersion: state.handbookVersion,
    handbookGeneratedAt: state.handbookGeneratedAt
      ? state.handbookGeneratedAt.toISOString()
      : null,
    previewPath: state.previewPath,
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
    handbookHtml?: string | null;
    handbookLifecycle?: HandbookLifecycleStatusValue;
    handbookPublishedAt?: Date | null;
    handbookArchivedAt?: Date | null;
    incrementHandbookVersion?: boolean;
    previewPath?: string | null;
  },
): Promise<void> {
  const handbookGeneratedAt = state.handbookHtml ? new Date() : undefined;
  const ownedSession = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: { id: true },
  });
  if (!ownedSession) return;

  const lifecycleCreateData =
    state.handbookLifecycle === undefined
      ? {}
      : ({
          handbookLifecycle: state.handbookLifecycle,
          handbookPublishedAt:
            state.handbookPublishedAt === undefined ? null : state.handbookPublishedAt,
          handbookArchivedAt:
            state.handbookArchivedAt === undefined ? null : state.handbookArchivedAt,
        } satisfies Record<string, unknown>);
  const lifecycleUpdateData =
    state.handbookLifecycle === undefined
      ? {}
      : ({
          handbookLifecycle: state.handbookLifecycle,
          handbookPublishedAt:
            state.handbookPublishedAt === undefined ? undefined : state.handbookPublishedAt,
          handbookArchivedAt:
            state.handbookArchivedAt === undefined ? undefined : state.handbookArchivedAt,
        } satisfies Record<string, unknown>);

  await db.sessionState.upsert({
    where: { sessionId },
    create: {
      sessionId,
      context: toNullableInputJson(state.context),
      blocks: toNullableInputJson(state.blocks),
      spotBlocks: toNullableInputJson(state.spotBlocks),
      toolOutputs: toNullableInputJson(state.toolOutputs),
      handbookHtml:
        state.handbookHtml === undefined ? null : state.handbookHtml,
      ...lifecycleCreateData,
      handbookVersion: state.incrementHandbookVersion ? 1 : 0,
      handbookGeneratedAt: handbookGeneratedAt ?? null,
      previewPath:
        state.previewPath === undefined ? null : state.previewPath,
    },
    update: {
      context: toNullableInputJson(state.context),
      blocks: toNullableInputJson(state.blocks),
      spotBlocks: toNullableInputJson(state.spotBlocks),
      toolOutputs: toNullableInputJson(state.toolOutputs),
      handbookHtml:
        state.handbookHtml === undefined ? undefined : state.handbookHtml,
      ...lifecycleUpdateData,
      handbookVersion: state.incrementHandbookVersion
        ? { increment: 1 }
        : undefined,
      handbookGeneratedAt:
        handbookGeneratedAt === undefined ? undefined : handbookGeneratedAt,
      previewPath:
        state.previewPath === undefined ? undefined : state.previewPath,
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
    handbookHtml?: string | null;
    handbookLifecycle?: HandbookLifecycleStatusValue;
    handbookPublishedAt?: Date | null;
    handbookArchivedAt?: Date | null;
    incrementHandbookVersion?: boolean;
    previewPath?: string | null;
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
  const session = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      id: true,
      state: {
        select: {
          handbookHtml: true,
          handbookLifecycle: true,
          handbookPublishedAt: true,
          handbookArchivedAt: true,
        },
      },
    },
  });

  if (!session) return null;

  const existingLifecycle =
    session.state?.handbookLifecycle ?? HANDBOOK_LIFECYCLE_STATUS.DRAFT;
  if (existingLifecycle === lifecycle) {
    return {
      handbookLifecycle: existingLifecycle,
      handbookPublishedAt: session.state?.handbookPublishedAt
        ? session.state.handbookPublishedAt.toISOString()
        : null,
      handbookArchivedAt: session.state?.handbookArchivedAt
        ? session.state.handbookArchivedAt.toISOString()
        : null,
    };
  }

  if (lifecycle === HANDBOOK_LIFECYCLE_STATUS.PUBLIC) {
    const html = session.state?.handbookHtml;
    if (!html || !html.trim()) {
      throw new HandbookLifecycleError(
        'Cannot set handbook lifecycle to PUBLIC before handbook HTML is generated.',
        'MISSING_HTML_FOR_PUBLIC',
      );
    }
  }

  const now = new Date();
  await db.sessionState.upsert({
    where: { sessionId },
    create: {
      sessionId,
      handbookLifecycle: lifecycle,
      handbookPublishedAt: lifecycle === HANDBOOK_LIFECYCLE_STATUS.PUBLIC ? now : null,
      handbookArchivedAt: lifecycle === HANDBOOK_LIFECYCLE_STATUS.ARCHIVED ? now : null,
    },
    update: {
      handbookLifecycle: lifecycle,
      handbookPublishedAt:
        lifecycle === HANDBOOK_LIFECYCLE_STATUS.PUBLIC ? now : undefined,
      handbookArchivedAt:
        lifecycle === HANDBOOK_LIFECYCLE_STATUS.ARCHIVED ? now : undefined,
    },
  });

  const updated = await db.sessionState.findUnique({
    where: { sessionId },
    select: {
      handbookLifecycle: true,
      handbookPublishedAt: true,
      handbookArchivedAt: true,
    },
  });
  if (!updated) return null;

  return {
    handbookLifecycle: updated.handbookLifecycle,
    handbookPublishedAt: updated.handbookPublishedAt
      ? updated.handbookPublishedAt.toISOString()
      : null,
    handbookArchivedAt: updated.handbookArchivedAt
      ? updated.handbookArchivedAt.toISOString()
      : null,
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
  const session = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      title: true,
      state: {
        select: {
          handbookHtml: true,
          handbookVersion: true,
        },
      },
    },
  });

  if (!session?.state?.handbookHtml) return null;

  return {
    title: session.title,
    html: session.state.handbookHtml,
    handbookVersion: session.state.handbookVersion,
  };
}

export async function getSessionHandbookById(
  sessionId: string,
): Promise<{
  title: string;
  html: string;
  handbookVersion: number;
} | null> {
  const session = await db.session.findFirst({
    where: {
      id: sessionId,
    },
    select: {
      title: true,
      state: {
        select: {
          handbookHtml: true,
          handbookVersion: true,
        },
      },
    },
  });

  if (!session?.state?.handbookHtml) return null;

  return {
    title: session.title,
    html: session.state.handbookHtml,
    handbookVersion: session.state.handbookVersion,
  };
}

export async function getPublicSessionHandbook(
  sessionId: string,
): Promise<{
  title: string;
  html: string;
  handbookVersion: number;
} | null> {
  const session = await db.session.findFirst({
    where: {
      id: sessionId,
      state: {
        is: {
          handbookLifecycle: HANDBOOK_LIFECYCLE_STATUS.PUBLIC,
        },
      },
    },
    select: {
      title: true,
      state: {
        select: {
          handbookHtml: true,
          handbookVersion: true,
        },
      },
    },
  });

  if (!session?.state?.handbookHtml) return null;

  return {
    title: session.title,
    html: session.state.handbookHtml,
    handbookVersion: session.state.handbookVersion,
  };
}
