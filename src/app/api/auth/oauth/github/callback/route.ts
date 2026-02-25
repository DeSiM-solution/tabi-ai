import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveOAuthUser } from '@/server/auth';
import {
  USER_ID_COOKIE_MAX_AGE_SECONDS,
  USER_ID_COOKIE_NAME,
} from '@/lib/user-identity';

const GITHUB_OAUTH_STATE_COOKIE = 'ai_next_github_oauth_state';
const GITHUB_OAUTH_CALLBACK_COOKIE = 'ai_next_github_oauth_callback';

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
    name: GITHUB_OAUTH_STATE_COOKIE,
    value: '',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set({
    name: GITHUB_OAUTH_CALLBACK_COOKIE,
    value: '',
    path: '/',
    maxAge: 0,
  });

  return response;
}

export async function GET(req: Request) {
  const clientId = process.env.AUTH_GITHUB_CLIENT_ID;
  const clientSecret = process.env.AUTH_GITHUB_CLIENT_SECRET;
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;
  const callbackPath = toCallbackPath(
    requestUrl.searchParams.get('callbackUrl') ?? undefined,
  );

  if (!clientId || !clientSecret) {
    return buildLoginRedirect(origin, callbackPath, 'oauth_github_not_configured');
  }

  const responseState = requestUrl.searchParams.get('state');
  const requestError = requestUrl.searchParams.get('error');
  const code = requestUrl.searchParams.get('code');

  const cookieStore = await cookies();
  const stateFromCookie = cookieStore.get(GITHUB_OAUTH_STATE_COOKIE)?.value;
  const callbackPathFromCookie = toCallbackPath(
    cookieStore.get(GITHUB_OAUTH_CALLBACK_COOKIE)?.value,
  );

  const effectiveCallbackPath = callbackPathFromCookie || callbackPath;

  if (requestError) {
    return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_github_denied');
  }

  if (!responseState || !stateFromCookie || responseState !== stateFromCookie) {
    return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_github_state_mismatch');
  }

  if (!code) {
    return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_github_missing_code');
  }

  try {
    const redirectUri = `${origin}/api/auth/oauth/github/callback`;

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_github_token_failed');
    }

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
    };
    const accessToken = tokenPayload.access_token;
    if (!accessToken) {
      return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_github_no_token');
    }

    const profileResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ai-next',
      },
    });

    if (!profileResponse.ok) {
      return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_github_profile_failed');
    }

    const profile = (await profileResponse.json()) as {
      id?: number;
      login?: string;
      name?: string;
      email?: string | null;
      avatar_url?: string | null;
    };

    if (!profile.id) {
      return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_github_invalid_profile');
    }

    let primaryEmail = profile.email ?? null;

    if (!primaryEmail) {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ai-next',
        },
      });

      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as Array<{
          email?: string;
          primary?: boolean;
          verified?: boolean;
        }>;

        const primaryVerified = emails.find(item => item.primary && item.verified && item.email);
        const firstVerified = emails.find(item => item.verified && item.email);
        primaryEmail = primaryVerified?.email ?? firstVerified?.email ?? null;
      }
    }

    const user = await resolveOAuthUser({
      provider: 'github',
      providerAccountId: String(profile.id),
      email: primaryEmail,
      displayName: profile.name ?? profile.login ?? null,
      image: profile.avatar_url ?? null,
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
      name: GITHUB_OAUTH_STATE_COOKIE,
      value: '',
      path: '/',
      maxAge: 0,
    });
    response.cookies.set({
      name: GITHUB_OAUTH_CALLBACK_COOKIE,
      value: '',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('[auth_api] github-callback-failed', error);
    return buildLoginRedirect(origin, effectiveCallbackPath, 'oauth_github_callback_failed');
  }
}
