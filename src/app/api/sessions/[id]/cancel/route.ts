import { NextResponse } from 'next/server';
import { markSessionCancelled } from '@/server/events';
import { getRequestUserId } from '@/server/request-user';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const sessionId = resolvedParams.id;
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session id.' }, { status: 400 });
  }

  try {
    const userId = getRequestUserId(req);
    await markSessionCancelled(sessionId, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[sessions_api] cancel-failed', { sessionId, error });
    return NextResponse.json(
      { error: 'Failed to cancel session.' },
      { status: 500 },
    );
  }
}
