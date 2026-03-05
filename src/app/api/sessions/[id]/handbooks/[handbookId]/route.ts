import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  removeSessionHandbook,
  updateSessionHandbook,
} from '@/server/sessions';
import { getRequestUserId } from '@/server/request-user';

function getParams(input: { id: string; handbookId: string }) {
  return {
    sessionId: input.id,
    handbookId: input.handbookId,
  };
}

const patchSessionHandbookSchema = z.object({
  title: z.string().trim().min(1).optional(),
  html: z.string().trim().min(1).optional(),
  previewPath: z.string().optional().nullable(),
  sourceContext: z.unknown().optional(),
  sourceBlocks: z.unknown().optional(),
  sourceSpotBlocks: z.unknown().optional(),
  sourceToolOutputs: z.unknown().optional(),
  style: z.string().optional().nullable(),
  thumbnailUrl: z.string().optional().nullable(),
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
    const parsed = patchSessionHandbookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid patch handbook payload.' },
        { status: 400 },
      );
    }

    const handbook = await updateSessionHandbook(handbookId, userId, parsed.data);
    if (!handbook || handbook.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Handbook not found.' }, { status: 404 });
    }
    return NextResponse.json({ handbook });
  } catch (error) {
    console.error('[session_handbook_api] patch-failed', { sessionId, handbookId, error });
    return NextResponse.json(
      { error: 'Failed to update handbook.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    const removed = await removeSessionHandbook(handbookId, userId);
    if (!removed) {
      return NextResponse.json({ error: 'Handbook not found.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[session_handbook_api] delete-failed', { sessionId, handbookId, error });
    return NextResponse.json(
      { error: 'Failed to delete handbook.' },
      { status: 500 },
    );
  }
}
