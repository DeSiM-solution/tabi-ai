import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  USER_ID_COOKIE_MAX_AGE_SECONDS,
  USER_ID_COOKIE_NAME,
  USER_ID_HEADER_NAME,
} from '@/lib/user-identity';

function normalizeUserId(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 128);
}

export function middleware(request: NextRequest) {
  const cookieUserId = normalizeUserId(
    request.cookies.get(USER_ID_COOKIE_NAME)?.value,
  );
  const userId = cookieUserId ?? crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(USER_ID_HEADER_NAME, userId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (!cookieUserId) {
    response.cookies.set({
      name: USER_ID_COOKIE_NAME,
      value: userId,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: USER_ID_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
