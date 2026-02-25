import { NextResponse } from 'next/server';
import { USER_ID_COOKIE_NAME } from '@/lib/user-identity';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: USER_ID_COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
  });
  return response;
}
