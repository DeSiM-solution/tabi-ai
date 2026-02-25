import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

const GITHUB_OAUTH_STATE_COOKIE = 'ai_next_github_oauth_state';
const GITHUB_OAUTH_CALLBACK_COOKIE = 'ai_next_github_oauth_callback';
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
  const clientId = process.env.AUTH_GITHUB_CLIENT_ID;
  const clientSecret = process.env.AUTH_GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'GitHub OAuth is not configured.' },
      { status: 500 },
    );
  }

  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;
  const callbackPath = sanitizeCallbackPath(
    requestUrl.searchParams.get('callbackUrl'),
    origin,
  );
  const redirectUri = `${origin}/api/auth/oauth/github/callback`;
  const state = randomBytes(24).toString('hex');

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', clientId);
  githubAuthUrl.searchParams.set('redirect_uri', redirectUri);
  githubAuthUrl.searchParams.set('scope', 'read:user user:email');
  githubAuthUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(githubAuthUrl);
  response.cookies.set({
    name: GITHUB_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });
  response.cookies.set({
    name: GITHUB_OAUTH_CALLBACK_COOKIE,
    value: encodeURIComponent(callbackPath),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
