import type { UIMessage } from 'ai';
import {
  MessageRole,
  Prisma,
  SessionStatus,
  SessionStepStatus,
  SessionToolName,
} from '@prisma/client';
import db from '@/lib/db';
import {
  formatSessionDateTime,
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
  meta: string;
  isError: boolean;
  status: SessionSummaryStatus;
  lastStep: string | null;
  startedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SessionDetailDto {
  id: string;
  title: string;
  description: string | null;
  status: SessionStatus;
  currentStep: SessionToolName | null;
  failedStep: SessionToolName | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  state: {
    context: unknown;
    blocks: unknown;
    spotBlocks: unknown;
    toolOutputs: unknown;
    handbookHtml: string | null;
    handbookVersion: number;
    handbookGeneratedAt: string | null;
    previewPath: string | null;
  } | null;
  steps: Array<{
    id: string;
    toolName: SessionToolName;
    status: SessionStepStatus;
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
  status: SessionStatus;
  currentStep: SessionToolName | null;
  failedStep: SessionToolName | null;
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

function formatStepLabel(step: SessionToolName | null): string {
  if (!step) return 'idle';
  if (step === 'parse_youtube_input') return 'Parse URL';
  if (step === 'crawl_youtube_videos') return 'Crawl Video';
  if (step === 'build_travel_blocks') return 'Build Blocks';
  if (step === 'resolve_spot_coordinates') return 'Resolve Coordinates';
  if (step === 'search_image') return 'Search Images';
  if (step === 'generate_image') return 'Generate Images';
  return 'Generate Handbook';
}

function toSessionSummaryStatus(status: SessionStatus): SessionSummaryStatus {
  if (status === SessionStatus.RUNNING) return 'loading';
  if (status === SessionStatus.ERROR) return 'error';
  if (status === SessionStatus.COMPLETED) return 'completed';
  if (status === SessionStatus.CANCELLED) return 'cancelled';
  return 'idle';
}

function toSessionSummary(model: SessionSummaryModel): SessionSummaryDto {
  const mappedStatus = toSessionSummaryStatus(model.status);
  const sessionTime = resolveSessionTimeValue(model.startedAt, model.createdAt);
  const meta =
    mappedStatus === 'loading'
      ? `Running · ${formatStepLabel(model.currentStep)}`
      : mappedStatus === 'error'
        ? 'Error'
        : mappedStatus === 'cancelled'
          ? 'Stopped'
          : sessionTime
            ? formatSessionDateTime(sessionTime)
            : '-';

  return {
    id: model.id,
    title: model.title,
    description: model.description,
    meta,
    isError: mappedStatus === 'error',
    status: mappedStatus,
    lastStep: (model.failedStep ?? model.currentStep) ?? null,
    startedAt: model.startedAt ? model.startedAt.getTime() : null,
    createdAt: model.createdAt.getTime(),
    updatedAt: model.updatedAt.getTime(),
  };
}

function fromMessageRole(role: MessageRole): UIMessage['role'] {
  if (role === MessageRole.ASSISTANT) return 'assistant';
  if (role === MessageRole.SYSTEM) return 'system';
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

function mergeJsonValues(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return patch;
  return {
    ...base,
    ...patch,
  };
}

const sessionSummarySelect = {
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
  return db.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: sessionSummarySelect,
  });
}

export async function listSessionSummaries(userId: string): Promise<SessionSummaryDto[]> {
  const sessions = await db.session.findMany({
    where: { userId },
    orderBy: [
      { updatedAt: 'desc' },
      { id: 'desc' },
    ],
    select: sessionSummarySelect,
  });
  return sessions.map(toSessionSummary);
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
          status: SessionStatus.IDLE,
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
      status: SessionStatus.IDLE,
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
  const description = input.description?.trim() || null;
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
      status: SessionStatus.RUNNING,
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
          description,
          status: SessionStatus.RUNNING,
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
    status?: SessionStatus;
    currentStep?: SessionToolName | null;
    failedStep?: SessionToolName | null;
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

export async function removeSession(sessionId: string, userId: string): Promise<void> {
  await db.session.deleteMany({
    where: {
      id: sessionId,
      userId,
    },
  });
}

export async function getSessionDetail(
  sessionId: string,
  userId: string,
): Promise<SessionDetailDto | null> {
  const session = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
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
          context: session.state.context,
          blocks: session.state.blocks,
          spotBlocks: session.state.spotBlocks,
          toolOutputs: session.state.toolOutputs,
          handbookHtml: session.state.handbookHtml,
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
): Promise<SessionStatus | null> {
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
  handbookVersion: number;
  handbookGeneratedAt: string | null;
  previewPath: string | null;
}

export async function getSessionStateSnapshot(
  sessionId: string,
  userId: string,
): Promise<SessionStateSnapshot | null> {
  const state = await db.sessionState.findFirst({
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

  if (!state) return null;

  return {
    context: state.context,
    blocks: state.blocks,
    spotBlocks: state.spotBlocks,
    toolOutputs: state.toolOutputs,
    handbookHtml: state.handbookHtml,
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
