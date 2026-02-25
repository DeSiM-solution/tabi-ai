import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveOAuthUser } from '@/server/auth';
import {
  USER_ID_COOKIE_MAX_AGE_SECONDS,
  USER_ID_COOKIE_NAME,
} from '@/lib/user-identity';

const GOOGLE_OAUTH_STATE_COOKIE = 'ai_next_google_oauth_state';
const GOOGLE_OAUTH_CALLBACK_COOKIE = 'ai_next_google_oauth_callback';

function toCallbackPath(raw: string | undefined): string {
  if (!raw) return '/';
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith('/') ? decoded : '/';
  } catch {
    return '/';
  }
}

function buildLoginRedirect(
  origin: string,
  callbackPath: string,
  errorCode: string,
): NextResponse {
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', errorCode);
  if (callbackPath && callbackPath !== '/') {
    loginUrl.searchParams.set('callbackUrl', callbackPath);
  }

  const response = NextResponse.redirect(loginUrl);
  response.cookies.set({
    name: GOOGLE_OAUTH_STATE_COOKIE,
    value: '',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set({
    name: GOOGLE_OAUTH_CALLBACK_COOKIE,
    value: '',
    path: '/',
    maxAge: 0,
  });

  return response;
}

export async function GET(req: Request) {
  const clientId = process.env.AUTH_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET;
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;
  const callbackPath = toCallbackPath(
    requestUrl.searchParams.get('callbackUrl') ?? undefined,
  );

  if (!clientId || !clientSecret) {
    return buildLoginRedirect(origin, callbackPath, 'oauth_google_not_configured');
  }

  const responseState = requestUrl.searchParams.get('state');
  const requestError = requestUrl.searchParams.get('error');
  const code = requestUrl.searchParams.get('code');

  const cookieStore = await cookies();
  const stateFromCookie = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const callbackPathFromCookie = toCallbackPath(
    cookieStore.get(GOOGLE_OAUTH_CALLBACK_COOKIE)?.value,
  );

  const effectiveCallbackPath = callbackPathFromCookie || callbackPath;

  if (requestError) {
    return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_google_denied');
  }

  if (!responseState || !stateFromCookie || responseState !== stateFromCookie) {
    return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_google_state_mismatch');
  }

  if (!code) {
    return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_google_missing_code');
  }

  try {
    const redirectUri = `${origin}/api/auth/oauth/google/callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_google_token_failed');
    }

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
    };
    const accessToken = tokenPayload.access_token;
    if (!accessToken) {
      return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_google_no_token');
    }

    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!profileResponse.ok) {
      return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_google_profile_failed');
    }

    const profile = (await profileResponse.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!profile.sub) {
      return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_google_invalid_profile');
    }

    const user = await resolveOAuthUser({
      provider: 'google',
      providerAccountId: profile.sub,
      email: profile.email ?? null,
      displayName: profile.name ?? null,
      image: profile.picture ?? null,
    });

    const targetUrl = new URL(
      effectiveCallbackPath && effectiveCallbackPath !== '/'
        ? effectiveCallbackPath
        : '/',
      origin,
    );
    const response = NextResponse.redirect(targetUrl);

    response.cookies.set({
      name: USER_ID_COOKIE_NAME,
      value: user.id,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: USER_ID_COOKIE_MAX_AGE_SECONDS,
    });
    response.cookies.set({
      name: GOOGLE_OAUTH_STATE_COOKIE,
      value: '',
      path: '/',
      maxAge: 0,
    });
    response.cookies.set({
      name: GOOGLE_OAUTH_CALLBACK_COOKIE,
      value: '',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('[auth_api] google-callback-failed', error);
    return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_google_callback_failed');
  }
}
