import { SessionStatus, SessionToolName } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSessionDetail,
  removeSession,
  updateSessionPartial,
} from '@/server/sessions';

const patchSessionSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  status: z.nativeEnum(SessionStatus).optional(),
  currentStep: z.nativeEnum(SessionToolName).optional().nullable(),
  failedStep: z.nativeEnum(SessionToolName).optional().nullable(),
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
    const body = await req.json().catch(() => ({}));
    const parsed = patchSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid patch payload.' },
        { status: 400 },
      );
    }

    const session = await updateSessionPartial(sessionId, parsed.data);
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
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const sessionId = getSessionId(resolvedParams);
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session id.' }, { status: 400 });
  }

  try {
    await removeSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[sessions_api] delete-failed', { sessionId, error });
    return NextResponse.json(
      { error: 'Failed to delete session.' },
      { status: 500 },
    );
  }
}
