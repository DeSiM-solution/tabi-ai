import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HANDBOOK_LIFECYCLE_OPTIONS } from '@/lib/handbook-lifecycle';
import {
  createSessionHandbook,
  listSessionHandbooks,
} from '@/server/sessions';
import { getRequestUserId } from '@/server/request-user';

function getSessionId(params: { id: string }): string {
  return params.id;
}

const createSessionHandbookSchema = z.object({
  title: z.string().trim().min(1).optional(),
  html: z.string().trim().min(1),
  lifecycle: z.enum(HANDBOOK_LIFECYCLE_OPTIONS).optional(),
  previewPath: z.string().optional().nullable(),
  sourceContext: z.unknown().optional(),
  sourceBlocks: z.unknown().optional(),
  sourceSpotBlocks: z.unknown().optional(),
  sourceToolOutputs: z.unknown().optional(),
  style: z.string().optional().nullable(),
  thumbnailUrl: z.string().optional().nullable(),
  setActive: z.boolean().optional(),
});

export async function GET(
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
    const payload = await listSessionHandbooks(sessionId, userId);
    if (!payload) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[session_handbooks_api] list-failed', { sessionId, error });
    return NextResponse.json(
      { error: 'Failed to fetch handbooks.' },
      { status: 500 },
    );
  }
}

export async function POST(
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
    const parsed = createSessionHandbookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid create handbook payload.' },
        { status: 400 },
      );
    }

    const handbook = await createSessionHandbook(sessionId, userId, parsed.data);
    if (!handbook) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }

    return NextResponse.json({ handbook }, { status: 201 });
  } catch (error) {
    console.error('[session_handbooks_api] create-failed', { sessionId, error });
    return NextResponse.json(
      { error: 'Failed to create handbook.' },
      { status: 500 },
    );
  }
}
