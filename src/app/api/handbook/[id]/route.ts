import { NextResponse } from 'next/server';
import { getSessionHandbook } from '@/server/sessions';
import { getRequestUserId } from '@/server/request-user';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const sessionId = resolvedParams.id;
  if (!sessionId) {
    return new NextResponse('Missing session id.', { status: 400 });
  }

  try {
    const userId = getRequestUserId(req);
    const handbook = await getSessionHandbook(sessionId, userId);
    if (!handbook) {
      return new NextResponse('Handbook not found.', { status: 404 });
    }

    return new NextResponse(handbook.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'X-Handbook-Version': String(handbook.handbookVersion),
      },
    });
  } catch (error) {
    console.error('[handbook_api] fetch-failed', { sessionId, error });
    return new NextResponse('Failed to load handbook.', { status: 500 });
  }
}
