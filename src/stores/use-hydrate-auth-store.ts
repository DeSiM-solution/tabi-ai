'use client';

import { useEffect } from 'react';
import { authActions } from '@/stores/auth-store';

export function useHydrateAuthStore(): void {
  useEffect(() => {
    if (authActions.refreshIfNeeded()) {
      void authActions.hydrateFromServer();
    }

    const onFocus = () => {
      if (!authActions.refreshIfNeeded()) return;
      void authActions.hydrateFromServer();
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
}
