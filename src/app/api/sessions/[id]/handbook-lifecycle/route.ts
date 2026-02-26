import { HandbookLifecycleStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  HandbookLifecycleError,
  setSessionHandbookLifecycle,
} from '@/server/sessions';
import { getRequestUserId } from '@/server/request-user';

const patchHandbookLifecycleSchema = z.object({
  lifecycle: z.nativeEnum(HandbookLifecycleStatus),
});

function getSessionId(params: { id: string }): string {
  return params.id;
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
    const parsed = patchHandbookLifecycleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid handbook lifecycle payload.' },
        { status: 400 },
      );
    }

    const lifecycle = await setSessionHandbookLifecycle(
      sessionId,
      userId,
      parsed.data.lifecycle,
    );
    if (!lifecycle) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    return NextResponse.json({ lifecycle });
  } catch (error) {
    if (error instanceof HandbookLifecycleError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[sessions_api] patch-handbook-lifecycle-failed', {
      sessionId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to patch handbook lifecycle.' },
      { status: 500 },
    );
  }
}
