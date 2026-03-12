import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DEFAULT_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'handbook';

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

export async function POST(req: Request) {
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          'Missing Supabase server env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.',
      },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
  }

  const extension = file.name.split('.').pop() || 'bin';
  const objectName = `upload-test/${Date.now()}-${randomUUID()}.${extension}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(DEFAULT_BUCKET)
    .upload(objectName, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(objectName);

  return NextResponse.json({
    path: `${DEFAULT_BUCKET}/${objectName}`,
    publicUrl: data?.publicUrl ?? null,
  });
}
