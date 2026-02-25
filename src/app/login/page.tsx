'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { LuGithub, LuLoader, LuLogIn } from 'react-icons/lu';
import { FcGoogle } from 'react-icons/fc';
import { authActions, useAuthStore } from '@/stores/auth-store';
import { useHydrateAuthStore } from '@/stores/use-hydrate-auth-store';

function normalizeCallbackPath(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  return input;
}

function toRegisterPath(callbackPath: string): string {
  if (!callbackPath || callbackPath === '/') return '/register';
  return `/register?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

function toOAuthStartPath(provider: 'google' | 'github', callbackPath: string): string {
  const path = `/api/auth/oauth/${provider}/start`;
  if (!callbackPath || callbackPath === '/') return path;
  return `${path}?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

function mapAuthErrorMessage(errorCode: string | null): string | null {
  if (!errorCode) return null;

  if (errorCode.startsWith('oauth_google_')) {
    return 'Google login failed. Please try again.';
  }
  if (errorCode.startsWith('oauth_github_')) {
    return 'GitHub login failed. Please try again.';
  }
  return 'Login failed. Please try again.';
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const user = useAuthStore(state => state.user);
  const loading = useAuthStore(state => state.loading);
  const apiError = useAuthStore(state => state.error);

  useHydrateAuthStore();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const callbackPath = useMemo(
    () => normalizeCallbackPath(searchParams.get('callbackUrl')),
    [searchParams],
  );
  const oauthError = useMemo(
    () => mapAuthErrorMessage(searchParams.get('error')),
    [searchParams],
  );

  useEffect(() => {
    if (!user || user.isGuest) return;
    router.replace(callbackPath);
  }, [callbackPath, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    try {
      await authActions.login({ identifier, password });
      router.push(callbackPath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to login. Please try again.';
      setLocalError(message);
    }
  };

  const effectiveError = localError || oauthError || apiError;

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] items-center px-6 py-10">
        <section className="w-full rounded-[18px] border border-border-light bg-bg-elevated p-6 shadow-[0_14px_36px_rgba(26,23,20,0.12)]">
          <div className="mb-4 flex justify-end">
            <Link
              href="/"
              aria-label="Back to home"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-light text-[14px] font-medium text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary"
            >
              ←
            </Link>
          </div>

          <div className="mb-6 text-center">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary">
              Login
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-text-secondary">
              Continue to your personal Tabi workspace.
            </p>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              value={identifier}
              onChange={event => setIdentifier(event.currentTarget.value)}
              placeholder="Username or email"
              autoComplete="username"
              className="h-10 w-full rounded-[10px] border border-border-light bg-bg-secondary px-3 text-[13px] outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
            />
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.currentTarget.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="h-10 w-full rounded-[10px] border border-border-light bg-bg-secondary px-3 text-[13px] outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] bg-accent-primary text-[13px] font-semibold text-text-inverse transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <LuLoader className="h-4 w-4 animate-spin" />
              ) : (
                <LuLogIn className="h-4 w-4" />
              )}
              Login
            </button>
          </form>

          <div className="my-4 flex items-center gap-2">
            <span className="h-px flex-1 bg-border-light" />
            <span className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
              Or continue with
            </span>
            <span className="h-px flex-1 bg-border-light" />
          </div>

          <div className="space-y-2">
            <a
              href={toOAuthStartPath('google', callbackPath)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-border-light bg-bg-secondary text-[13px] font-medium text-text-primary transition hover:bg-bg-primary"
            >
              <FcGoogle className="h-4 w-4" />
              Continue with Google
            </a>
            <a
              href={toOAuthStartPath('github', callbackPath)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-border-light bg-bg-secondary text-[13px] font-medium text-text-primary transition hover:bg-bg-primary"
            >
              <LuGithub className="h-4 w-4" />
              Continue with GitHub
            </a>
          </div>

          {effectiveError ? (
            <p className="mt-4 rounded-[10px] border border-status-error/30 bg-status-error/10 px-3 py-2 text-[12px] leading-5 text-status-error">
              {effectiveError}
            </p>
          ) : null}

          <p className="mt-5 text-center text-[12px] text-text-secondary">
            No account?{' '}
            <Link
              href={toRegisterPath(callbackPath)}
              className="font-semibold text-accent-primary hover:underline"
            >
              Register
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
