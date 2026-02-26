import { NextResponse } from 'next/server';
import { getPublicSessionHandbook } from '@/server/sessions';

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
    const handbook = await getPublicSessionHandbook(sessionId);
    if (!handbook) {
      return new NextResponse('Guide not found.', { status: 404 });
    }

    return new NextResponse(handbook.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'X-Handbook-Version': String(handbook.handbookVersion),
      },
    });
  } catch (error) {
    console.error('[public_guide_api] fetch-failed', { sessionId, error });
    return new NextResponse('Failed to load public guide.', { status: 500 });
  }
}
