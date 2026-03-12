import { NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';

const utmPayloadSchema = z.object({
  utm_source: z.string().trim().min(1).max(200).optional(),
  utm_campaign: z.string().trim().min(1).max(200).optional(),
  session_id: z.string().trim().min(1).max(200).optional(),
  utmSource: z.string().trim().min(1).max(200).optional(),
  utmCampaign: z.string().trim().min(1).max(200).optional(),
  sessionId: z.string().trim().min(1).max(200).optional(),
});

function resolveUtmPayload(raw: z.infer<typeof utmPayloadSchema>) {
  const utmSource = raw.utm_source ?? raw.utmSource ?? null;
  const utmCampaign = raw.utm_campaign ?? raw.utmCampaign ?? null;
  const sessionId = raw.session_id ?? raw.sessionId ?? null;

  if (!utmSource || !utmCampaign || !sessionId) {
    return null;
  }

  return { utmSource, utmCampaign, sessionId };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = utmPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid UTM payload.' },
        { status: 400 },
      );
    }

    const payload = resolveUtmPayload(parsed.data);
    if (!payload) {
      return NextResponse.json(
        { error: 'Missing utm_source, utm_campaign, or session_id.' },
        { status: 400 },
      );
    }

    const record = await db.utmTracking.upsert({
      where: { sessionId: payload.sessionId },
      create: {
        sessionId: payload.sessionId,
        utmSource: payload.utmSource,
        utmCampaign: payload.utmCampaign,
      },
      update: {
        utmSource: payload.utmSource,
        utmCampaign: payload.utmCampaign,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: record.id }, { status: 201 });
  } catch (error) {
    console.error('[utm_api] save-failed', error);
    return NextResponse.json(
      { error: 'Failed to save utm tracking.' },
      { status: 500 },
    );
  }
}
