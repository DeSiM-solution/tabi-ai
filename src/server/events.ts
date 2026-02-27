import type { UIMessage } from 'ai';
import {
  Prisma,
} from '@prisma/client';
import db from '@/lib/db';
import {
  MESSAGE_ROLE,
  SESSION_STATUS,
  SESSION_STEP_STATUS,
  type MessageRoleValue,
  type SessionToolNameValue,
} from '@/lib/session-enums';

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

function extractText(parts: unknown): string | null {
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map(part => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) return '';
      const record = part as Record<string, unknown>;
      if (record.type !== 'text' || typeof record.text !== 'string') return '';
      return record.text;
    })
    .join('')
    .trim();
  return text || null;
}

function toMessageRole(role: UIMessage['role']): MessageRoleValue {
  if (role === 'assistant') return MESSAGE_ROLE.ASSISTANT;
  if (role === 'system') return MESSAGE_ROLE.SYSTEM;
  return MESSAGE_ROLE.USER;
}

async function assertOwnedSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  const session = await db.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: { id: true },
  });
  if (!session) {
    throw new Error('Session not found for current user.');
  }
}

export async function upsertChatMessages(
  sessionId: string,
  userId: string,
  messages: UIMessage[],
): Promise<void> {
  await assertOwnedSession(sessionId, userId);
  const externalIds = messages.map(message => message.id);
  for (const [seq, message] of messages.entries()) {
    const text = extractText(message.parts);
    await db.chatMessage.upsert({
      where: {
        sessionId_externalId: {
          sessionId,
          externalId: message.id,
        },
      },
      create: {
        sessionId,
        externalId: message.id,
        seq,
        role: toMessageRole(message.role),
        text,
        parts: toNullableInputJson(message.parts),
      },
      update: {
        seq,
        role: toMessageRole(message.role),
        text,
        parts: toNullableInputJson(message.parts),
      },
    });
  }

  if (externalIds.length === 0) {
    await db.chatMessage.deleteMany({
      where: { sessionId },
    });
    return;
  }

  await db.chatMessage.deleteMany({
    where: {
      sessionId,
      externalId: {
        notIn: externalIds,
      },
    },
  });
}

export async function createSessionStep(input: {
  sessionId: string;
  userId: string;
  toolName: SessionToolNameValue;
  payload?: unknown;
}): Promise<string> {
  await assertOwnedSession(input.sessionId, input.userId);
  const now = new Date();
  const step = await db.sessionStep.create({
    data: {
      sessionId: input.sessionId,
      toolName: input.toolName,
      status: SESSION_STEP_STATUS.RUNNING,
      input: toNullableInputJson(input.payload),
      startedAt: now,
    },
    select: { id: true },
  });

  await db.session.updateMany({
    where: {
      id: input.sessionId,
      userId: input.userId,
    },
    data: {
      status: SESSION_STATUS.RUNNING,
      currentStep: input.toolName,
      failedStep: null,
      lastError: null,
      cancelledAt: null,
    },
  });

  return step.id;
}

export async function completeSessionStep(input: {
  stepId: string;
  sessionId: string;
  output?: unknown;
  durationMs?: number;
}): Promise<void> {
  await db.sessionStep.updateMany({
    where: {
      id: input.stepId,
      sessionId: input.sessionId,
    },
    data: {
      status: SESSION_STEP_STATUS.SUCCESS,
      output: toNullableInputJson(input.output),
      durationMs: input.durationMs ?? null,
      finishedAt: new Date(),
    },
  });
}

export async function failSessionStep(input: {
  stepId: string;
  sessionId: string;
  userId: string;
  toolName: SessionToolNameValue;
  errorMessage: string;
  durationMs?: number;
}): Promise<void> {
  await db.$transaction([
    db.sessionStep.updateMany({
      where: {
        id: input.stepId,
        sessionId: input.sessionId,
      },
      data: {
        status: SESSION_STEP_STATUS.ERROR,
        errorMessage: input.errorMessage,
        durationMs: input.durationMs ?? null,
        finishedAt: new Date(),
      },
    }),
    db.session.updateMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
      },
      data: {
        status: SESSION_STATUS.RUNNING,
        failedStep: input.toolName,
        currentStep: input.toolName,
        lastError: input.errorMessage,
      },
    }),
  ]);
}

export async function cancelSessionStep(input: {
  stepId: string;
  sessionId: string;
  userId: string;
  durationMs?: number;
}): Promise<void> {
  await db.$transaction([
    db.sessionStep.updateMany({
      where: {
        id: input.stepId,
        sessionId: input.sessionId,
      },
      data: {
        status: SESSION_STEP_STATUS.CANCELLED,
        durationMs: input.durationMs ?? null,
        finishedAt: new Date(),
      },
    }),
    db.session.updateMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
      },
      data: {
        status: SESSION_STATUS.CANCELLED,
        cancelledAt: new Date(),
        currentStep: null,
      },
    }),
  ]);
}

export async function markSessionCompleted(
  sessionId: string,
  userId: string,
): Promise<void> {
  await db.session.updateMany({
    where: {
      id: sessionId,
      userId,
      status: {
        not: SESSION_STATUS.CANCELLED,
      },
    },
    data: {
      status: SESSION_STATUS.COMPLETED,
      currentStep: null,
      failedStep: null,
      lastError: null,
      completedAt: new Date(),
    },
  });
}

export async function markSessionCancelled(
  sessionId: string,
  userId: string,
): Promise<void> {
  await db.session.updateMany({
    where: {
      id: sessionId,
      userId,
    },
    data: {
      status: SESSION_STATUS.CANCELLED,
      cancelledAt: new Date(),
      currentStep: null,
    },
  });
}

export async function markSessionError(
  sessionId: string,
  userId: string,
  errorMessage: string,
  options: { failedStep?: SessionToolNameValue | null } = {},
): Promise<void> {
  await db.session.updateMany({
    where: {
      id: sessionId,
      userId,
      status: {
        not: SESSION_STATUS.CANCELLED,
      },
    },
    data: {
      status: SESSION_STATUS.ERROR,
      lastError: errorMessage,
      failedStep: options.failedStep === undefined ? undefined : options.failedStep,
      currentStep: options.failedStep === undefined ? undefined : options.failedStep,
    },
  });
}
