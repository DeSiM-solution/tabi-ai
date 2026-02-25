import type { UIMessage } from 'ai';
import {
  MessageRole,
  Prisma,
  SessionStatus,
  SessionStepStatus,
  SessionToolName,
} from '@prisma/client';
import db from '@/lib/db';

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

function toMessageRole(role: UIMessage['role']): MessageRole {
  if (role === 'assistant') return MessageRole.ASSISTANT;
  if (role === 'system') return MessageRole.SYSTEM;
  return MessageRole.USER;
}

export async function upsertChatMessages(
  sessionId: string,
  messages: UIMessage[],
): Promise<void> {
  const externalIds = messages.map(message => message.id);
  await db.$transaction(async tx => {
    for (const [seq, message] of messages.entries()) {
      const text = extractText(message.parts);
      await tx.chatMessage.upsert({
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
      await tx.chatMessage.deleteMany({
        where: { sessionId },
      });
      return;
    }

    await tx.chatMessage.deleteMany({
      where: {
        sessionId,
        externalId: {
          notIn: externalIds,
        },
      },
    });
  });
}

export async function createSessionStep(input: {
  sessionId: string;
  toolName: SessionToolName;
  payload?: unknown;
}): Promise<string> {
  const now = new Date();
  const step = await db.sessionStep.create({
    data: {
      sessionId: input.sessionId,
      toolName: input.toolName,
      status: SessionStepStatus.RUNNING,
      input: toNullableInputJson(input.payload),
      startedAt: now,
    },
    select: { id: true },
  });

  await db.session.update({
    where: { id: input.sessionId },
    data: {
      status: SessionStatus.RUNNING,
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
  output?: unknown;
  durationMs?: number;
}): Promise<void> {
  await db.sessionStep.update({
    where: { id: input.stepId },
    data: {
      status: SessionStepStatus.SUCCESS,
      output: toNullableInputJson(input.output),
      durationMs: input.durationMs ?? null,
      finishedAt: new Date(),
    },
  });
}

export async function failSessionStep(input: {
  stepId: string;
  sessionId: string;
  toolName: SessionToolName;
  errorMessage: string;
  durationMs?: number;
}): Promise<void> {
  await db.$transaction([
    db.sessionStep.update({
      where: { id: input.stepId },
      data: {
        status: SessionStepStatus.ERROR,
        errorMessage: input.errorMessage,
        durationMs: input.durationMs ?? null,
        finishedAt: new Date(),
      },
    }),
    db.session.update({
      where: { id: input.sessionId },
      data: {
        status: SessionStatus.ERROR,
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
  durationMs?: number;
}): Promise<void> {
  await db.$transaction([
    db.sessionStep.update({
      where: { id: input.stepId },
      data: {
        status: SessionStepStatus.CANCELLED,
        durationMs: input.durationMs ?? null,
        finishedAt: new Date(),
      },
    }),
    db.session.update({
      where: { id: input.sessionId },
      data: {
        status: SessionStatus.CANCELLED,
        cancelledAt: new Date(),
        currentStep: null,
      },
    }),
  ]);
}

export async function markSessionCompleted(sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: {
      id: sessionId,
      status: {
        notIn: [SessionStatus.ERROR, SessionStatus.CANCELLED],
      },
    },
    data: {
      status: SessionStatus.COMPLETED,
      completedAt: new Date(),
    },
  });
}

export async function markSessionCancelled(sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId },
    data: {
      status: SessionStatus.CANCELLED,
      cancelledAt: new Date(),
      currentStep: null,
    },
  });
}

export async function markSessionError(
  sessionId: string,
  errorMessage: string,
): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId },
    data: {
      status: SessionStatus.ERROR,
      lastError: errorMessage,
    },
  });
}
