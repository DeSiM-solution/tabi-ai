import { NextResponse } from 'next/server';
import { listPublicSessionSummariesByUserId } from '@/server/sessions';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const userId = resolvedParams.id?.trim();

  if (!userId) {
    return NextResponse.json(
      { error: 'Missing user id.' },
      { status: 400 },
    );
  }

  try {
    const sessions = await listPublicSessionSummariesByUserId(userId);
    return NextResponse.json(
      { userId, sessions },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=120, s-maxage=120',
        },
      },
    );
  } catch (error) {
    console.error('[public_sessions_api] list-failed', { userId, error });
    return NextResponse.json(
      { error: 'Failed to fetch public sessions.' },
      { status: 500 },
    );
  }
}
