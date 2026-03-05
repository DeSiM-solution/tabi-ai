import { NextResponse } from 'next/server';
import { setActiveHandbook } from '@/server/sessions';
import { getRequestUserId } from '@/server/request-user';

function getParams(input: { id: string; handbookId: string }) {
  return {
    sessionId: input.id,
    handbookId: input.handbookId,
  };
}

export async function POST(
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
    const activated = await setActiveHandbook(sessionId, userId, handbookId);
    if (!activated) {
      return NextResponse.json({ error: 'Handbook not found.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[session_handbook_activate_api] activate-failed', {
      sessionId,
      handbookId,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to set active handbook.' },
      { status: 500 },
    );
  }
}
