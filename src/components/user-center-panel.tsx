'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LuLoader,
  LuLogIn,
  LuLogOut,
  LuUser,
} from 'react-icons/lu';
import { authActions, useAuthStore } from '@/stores/auth-store';
import { useHydrateAuthStore } from '@/stores/use-hydrate-auth-store';

function toSafeDisplayName(
  value: string | null,
  username: string | null,
  email: string | null,
): string {
  const raw = value?.trim() || username?.trim() || email?.trim() || 'Guest';
  return raw;
}

function toInitial(name: string): string {
  const first = [...name][0];
  if (!first) return '旅';
  return first.toUpperCase();
}

export function UserCenterPanel() {
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const loading = useAuthStore(state => state.loading);
  const error = useAuthStore(state => state.error);

  useHydrateAuthStore();

  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const effectiveError = localError || error;
  const isGuest = user?.isGuest ?? true;
  const displayName = useMemo(() => {
    if (!user) return 'Guest';
    return toSafeDisplayName(user.displayName, user.username, user.email);
  }, [user]);
  const triggerLabel = isGuest ? 'Guest' : toInitial(displayName);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
    };

    window.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const handleLogout = async () => {
    setLocalError(null);
    try {
      await authActions.logout();
      setOpen(false);
      router.replace('/login');
    } catch (logoutError) {
      const message =
        logoutError instanceof Error ? logoutError.message : 'Failed to logout.';
      setLocalError(message);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setLocalError(null);
          setOpen(previous => !previous);
        }}
        className={`inline-flex h-7 items-center justify-center rounded-[6px] bg-bg-secondary text-text-primary transition hover:brightness-95 ${
          isGuest
            ? 'min-w-7 px-2 text-[11px] font-medium'
            : 'w-7 text-[14px] font-semibold leading-none'
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open user center"
      >
        {triggerLabel}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="User center panel"
          className="absolute left-0 top-9 z-50 w-[260px] rounded-[12px] border border-border-light bg-bg-elevated p-3 shadow-[0_14px_32px_rgba(26,23,20,0.16)]"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            User Center
          </p>

          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary-bg text-[13px] font-semibold text-accent-primary">
              {toInitial(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-text-primary">
                {displayName}
              </p>
              <p className="truncate text-[11px] text-text-tertiary">
                {isGuest
                  ? 'Guest'
                  : user?.email?.trim() || 'No email'}
              </p>
            </div>
          </div>

          <div className="my-3 h-px bg-border-light" />

          {loading && !user ? (
            <div className="flex items-center gap-2 text-[12px] text-text-secondary">
              <LuLoader className="h-4 w-4 animate-spin" />
              Loading account...
            </div>
          ) : isGuest ? (
            <div className="space-y-2">
              <p className="text-[12px] leading-5 text-text-secondary">
                Login to keep your sessions under your own account.
              </p>

              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] bg-accent-primary-bg text-[12px] font-semibold text-accent-primary transition hover:brightness-95"
              >
                <LuLogIn className="h-4 w-4" />
                Login
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <Link
                href="/user"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] bg-accent-primary-bg text-[12px] font-semibold text-accent-primary transition hover:brightness-95"
              >
                <LuUser className="h-4 w-4" />
                Open User Center
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] border border-border-light text-[12px] font-semibold text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <LuLoader className="h-4 w-4 animate-spin" />
                ) : (
                  <LuLogOut className="h-4 w-4" />
                )}
                Logout
              </button>
            </div>
          )}

          {effectiveError ? (
            <p className="mt-2 text-[11px] leading-4 text-status-error">{effectiveError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
