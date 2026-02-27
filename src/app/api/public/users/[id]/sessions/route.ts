import { NextResponse } from 'next/server';
import { listPublicSessionSummariesByUserId } from '@/server/sessions';

function createCorsHeaders(): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return headers;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: createCorsHeaders(),
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const userId = resolvedParams.id?.trim();

  if (!userId) {
    return NextResponse.json(
      { error: 'Missing user id.' },
      {
        status: 400,
        headers: createCorsHeaders(),
      },
    );
  }

  try {
    const sessions = await listPublicSessionSummariesByUserId(userId);
    const headers = createCorsHeaders();
    headers.set('Cache-Control', 'public, max-age=120, s-maxage=120');

    return NextResponse.json(
      { userId, sessions },
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    console.error('[public_sessions_api] list-failed', { userId, error });
    return NextResponse.json(
      { error: 'Failed to fetch public sessions.' },
      {
        status: 500,
        headers: createCorsHeaders(),
      },
    );
  }
}
