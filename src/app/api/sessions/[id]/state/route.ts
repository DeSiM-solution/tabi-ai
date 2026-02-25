import { NextResponse } from 'next/server';
import { z } from 'zod';
import { patchSessionState } from '@/server/sessions';

const patchSessionStateSchema = z.object({
  context: z.unknown().optional(),
  blocks: z.unknown().optional(),
  spotBlocks: z.unknown().optional(),
  toolOutputs: z.unknown().optional(),
  handbookHtml: z.string().optional().nullable(),
  incrementHandbookVersion: z.boolean().optional(),
  previewPath: z.string().optional().nullable(),
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
    const body = await req.json().catch(() => ({}));
    const parsed = patchSessionStateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid session state patch payload.' },
        { status: 400 },
      );
    }

    await patchSessionState(sessionId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[sessions_api] patch-state-failed', { sessionId, error });
    return NextResponse.json(
      { error: 'Failed to patch session state.' },
      { status: 500 },
    );
  }
}
