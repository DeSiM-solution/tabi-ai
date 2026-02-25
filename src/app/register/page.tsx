'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { LuGithub, LuLoader, LuUserPlus } from 'react-icons/lu';
import { FcGoogle } from 'react-icons/fc';
import { authActions, useAuthStore } from '@/stores/auth-store';
import { useHydrateAuthStore } from '@/stores/use-hydrate-auth-store';

function normalizeCallbackPath(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  return input;
}

function toLoginPath(callbackPath: string): string {
  if (!callbackPath || callbackPath === '/') return '/login';
  return `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

function toOAuthStartPath(provider: 'google' | 'github', callbackPath: string): string {
  const path = `/api/auth/oauth/${provider}/start`;
  if (!callbackPath || callbackPath === '/') return path;
  return `${path}?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const user = useAuthStore(state => state.user);
  const loading = useAuthStore(state => state.loading);
  const apiError = useAuthStore(state => state.error);

  useHydrateAuthStore();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const callbackPath = useMemo(
    () => normalizeCallbackPath(searchParams.get('callbackUrl')),
    [searchParams],
  );

  useEffect(() => {
    if (!user || user.isGuest) return;
    router.replace(callbackPath);
  }, [callbackPath, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    try {
      await authActions.register({
        username,
        email: email || null,
        password,
      });
      router.push(callbackPath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to register. Please try again.';
      setLocalError(message);
    }
  };

  const effectiveError = localError || apiError;

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
              Register
            </h1>
            <p className="mt-2 text-[13px] leading-5 text-text-secondary">
              Create your account and keep guides under your identity.
            </p>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              value={username}
              onChange={event => setUsername(event.currentTarget.value)}
              placeholder="Username"
              autoComplete="username"
              className="h-10 w-full rounded-[10px] border border-border-light bg-bg-secondary px-3 text-[13px] outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
            />
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.currentTarget.value)}
              placeholder="Email (optional)"
              autoComplete="email"
              className="h-10 w-full rounded-[10px] border border-border-light bg-bg-secondary px-3 text-[13px] outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
            />
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.currentTarget.value)}
              placeholder="Password"
              autoComplete="new-password"
              className="h-10 w-full rounded-[10px] border border-border-light bg-bg-secondary px-3 text-[13px] outline-none transition focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.currentTarget.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
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
                <LuUserPlus className="h-4 w-4" />
              )}
              Create account
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
            Already have an account?{' '}
            <Link
              href={toLoginPath(callbackPath)}
              className="font-semibold text-accent-primary hover:underline"
            >
              Login
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
