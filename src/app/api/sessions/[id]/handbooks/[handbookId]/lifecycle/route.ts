import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HANDBOOK_LIFECYCLE_OPTIONS } from '@/lib/handbook-lifecycle';
import {
  HandbookLifecycleError,
  setHandbookLifecycle,
} from '@/server/sessions';
import { getRequestUserId } from '@/server/request-user';

function getParams(input: { id: string; handbookId: string }) {
  return {
    sessionId: input.id,
    handbookId: input.handbookId,
  };
}

const patchHandbookLifecycleSchema = z.object({
  lifecycle: z.enum(HANDBOOK_LIFECYCLE_OPTIONS),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; handbookId: string }> },
) {
  const resolvedParams = await params;
  const { sessionId, handbookId } = getParams(resolvedParams);
  if (!sessionId || !handbookId) {
    return NextResponse.json(
      { error: 'Missing session id or handbook id.' },
      { status: 400 },
    );
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

    const lifecycle = await setHandbookLifecycle(
      handbookId,
      userId,
      parsed.data.lifecycle,
    );
    if (!lifecycle) {
      return NextResponse.json({ error: 'Handbook not found.' }, { status: 404 });
    }
    return NextResponse.json({ lifecycle });
  } catch (error) {
    if (error instanceof HandbookLifecycleError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[session_handbook_lifecycle_api] patch-lifecycle-failed', {
      sessionId,
      handbookId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to patch handbook lifecycle.' },
      { status: 500 },
    );
  }
}
