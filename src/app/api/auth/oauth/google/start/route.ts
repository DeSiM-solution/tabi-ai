import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

const GOOGLE_OAUTH_STATE_COOKIE = 'ai_next_google_oauth_state';
const GOOGLE_OAUTH_CALLBACK_COOKIE = 'ai_next_google_oauth_callback';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10;

function sanitizeCallbackPath(raw: string | null, origin: string): string {
  if (!raw) return '/';
  if (raw.startsWith('/')) return raw;

  try {
    const parsed = new URL(raw);
    if (parsed.origin === origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return '/';
  }

  return '/';
}

export async function GET(req: Request) {
  const clientId = process.env.AUTH_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured.' },
      { status: 500 },
    );
  }

  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;
  const callbackPath = sanitizeCallbackPath(
    requestUrl.searchParams.get('callbackUrl'),
    origin,
  );
  const redirectUri = `${origin}/api/auth/oauth/google/callback`;
  const state = randomBytes(24).toString('hex');

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', clientId);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', state);
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(googleAuthUrl);
  response.cookies.set({
    name: GOOGLE_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });
  response.cookies.set({
    name: GOOGLE_OAUTH_CALLBACK_COOKIE,
    value: encodeURIComponent(callbackPath),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
