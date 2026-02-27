import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SESSION_STATUS_VALUES,
  SESSION_TOOL_NAME_VALUES,
} from '@/lib/session-enums';
import {
  getSessionDetail,
  removeSession,
  updateSessionPartial,
} from '@/server/sessions';
import { getRequestUserId } from '@/server/request-user';

const patchSessionSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  status: z.enum(SESSION_STATUS_VALUES).optional(),
  currentStep: z.enum(SESSION_TOOL_NAME_VALUES).optional().nullable(),
  failedStep: z.enum(SESSION_TOOL_NAME_VALUES).optional().nullable(),
  lastError: z.string().optional().nullable(),
});

function getSessionId(params: { id: string }): string {
  return params.id;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const sessionId = getSessionId(resolvedParams);
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session id.' }, { status: 400 });
  }

  try {
    const session = await getSessionDetail(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    console.error('[sessions_api] detail-failed', { sessionId, error });
    return NextResponse.json(
      { error: 'Failed to fetch session detail.' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const sessionId = getSessionId(resolvedParams);
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session id.' }, { status: 400 });
  }

  try {
    const userId = getRequestUserId(req);
    const body = await req.json().catch(() => ({}));
    const parsed = patchSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid patch payload.' },
        { status: 400 },
      );
    }

    const session = await updateSessionPartial(sessionId, userId, parsed.data);
    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    console.error('[sessions_api] patch-failed', { sessionId, error });
    return NextResponse.json(
      { error: 'Failed to update session.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const sessionId = getSessionId(resolvedParams);
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session id.' }, { status: 400 });
  }

  try {
    const userId = getRequestUserId(req);
    const removed = await removeSession(sessionId, userId);
    if (!removed) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[sessions_api] delete-failed', { sessionId, error });
    return NextResponse.json(
      { error: 'Failed to delete session.' },
      { status: 500 },
    );
  }
}
