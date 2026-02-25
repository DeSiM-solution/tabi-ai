import { NextResponse } from 'next/server';
import { getSessionHandbook } from '@/server/sessions';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const sessionId = resolvedParams.id;
  if (!sessionId) {
    return new NextResponse('Missing session id.', { status: 400 });
  }

  try {
    const handbook = await getSessionHandbook(sessionId);
    if (!handbook) {
      return new NextResponse('Guide not found.', { status: 404 });
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
    console.error('[guide_api] fetch-failed', { sessionId, error });
    return new NextResponse('Failed to load guide.', { status: 500 });
  }
}
