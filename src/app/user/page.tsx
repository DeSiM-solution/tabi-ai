'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { LuLogOut, LuUser } from 'react-icons/lu';
import { authActions, useAuthStore } from '@/stores/auth-store';
import { useHydrateAuthStore } from '@/stores/use-hydrate-auth-store';

function toDisplayName(input: {
  displayName: string | null;
  username: string | null;
  email: string | null;
}): string {
  return input.displayName || input.username || input.email || 'Guest';
}

export default function UserCenterPage() {
  const user = useAuthStore(state => state.user);
  const loading = useAuthStore(state => state.loading);
  const error = useAuthStore(state => state.error);

  useHydrateAuthStore();

  const displayName = useMemo(() => {
    if (!user) return 'Guest';
    return toDisplayName(user);
  }, [user]);

  const isGuest = user?.isGuest ?? true;

  return (
    <div className="min-h-screen bg-bg-primary px-6 py-10 text-text-primary">
      <div className="mx-auto w-full max-w-[680px] rounded-[18px] border border-border-light bg-bg-elevated p-6 shadow-[0_14px_36px_rgba(26,23,20,0.12)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
              User Center
            </p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
              {displayName}
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-[8px] border border-border-light px-3 text-[12px] font-medium text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary"
          >
            Back Home
          </Link>
        </div>

        <div className="mt-6 space-y-3">
          <div className="rounded-[12px] border border-border-light bg-bg-secondary p-4">
            <p className="text-[11px] text-text-tertiary">Username</p>
            <p className="mt-1 text-[13px] text-text-secondary">{user?.username ?? '-'}</p>
          </div>

          <div className="rounded-[12px] border border-border-light bg-bg-secondary p-4">
            <p className="text-[11px] text-text-tertiary">Email</p>
            <p className="mt-1 text-[13px] text-text-secondary">{user?.email ?? '-'}</p>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-[10px] border border-status-error/30 bg-status-error/10 px-3 py-2 text-[12px] text-status-error">
            {error}
          </p>
        ) : null}

        <div className="mt-6">
          {isGuest ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/login?callbackUrl=/user"
                className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-accent-primary-bg px-3 text-[12px] font-semibold text-accent-primary transition hover:brightness-95"
              >
                <LuUser className="h-4 w-4" />
                Login
              </Link>
              <Link
                href="/register?callbackUrl=/user"
                className="inline-flex h-9 items-center rounded-[8px] border border-border-light px-3 text-[12px] font-semibold text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary"
              >
                Register
              </Link>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                void authActions.logout();
              }}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border-light px-3 text-[12px] font-semibold text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LuLogOut className="h-4 w-4" />
              Logout
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
