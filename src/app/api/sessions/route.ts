import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, listSessionSummaries } from '@/server/sessions';

const createSessionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
});

export async function GET() {
  try {
    const sessions = await listSessionSummaries();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[sessions_api] list-failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid create session payload.' },
        { status: 400 },
      );
    }

    const session = await createSession(parsed.data);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error('[sessions_api] create-failed', error);
    return NextResponse.json(
      { error: 'Failed to create session.' },
      { status: 500 },
    );
  }
}
