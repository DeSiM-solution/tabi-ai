import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { AuthUserDto } from '@/server/auth';
import { getCurrentAuthUser } from '@/server/auth';
import {
  resolveRequestUserId,
} from '@/server/request-user';
import {
  USER_ID_COOKIE_MAX_AGE_SECONDS,
  USER_ID_COOKIE_NAME,
} from '@/lib/user-identity';

function setUserCookie(response: NextResponse, userId: string): void {
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

function buildGuestUser(userId: string): AuthUserDto {
  return {
    id: userId,
    username: null,
    email: null,
    displayName: null,
    image: null,
    isGuest: true,
    createdAt: null,
    lastLoginAt: null,
  };
}

export async function GET(req: Request) {
  const requestUserId = resolveRequestUserId(req);
  const userId = requestUserId ?? randomUUID();
  const shouldSetCookie = !requestUserId;

  try {
    const user = await getCurrentAuthUser(userId);
    const response = NextResponse.json({ user });
    if (shouldSetCookie) {
      setUserCookie(response, userId);
    }
    return response;
  } catch (error) {
    console.error('[auth_api] me-failed', error);
    const response = NextResponse.json({ user: buildGuestUser(userId) });
    if (shouldSetCookie) {
      setUserCookie(response, userId);
    }
    return response;
  }
}
