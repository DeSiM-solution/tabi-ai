'use client';

import { useEffect } from 'react';
import { sessionsActions } from '@/stores/sessions-store';

export function useHydrateSessionsStore(): void {
  useEffect(() => {
    if (sessionsActions.refreshIfNeeded()) {
      void sessionsActions.hydrateFromServer();
    }

    const onFocus = () => {
      if (!sessionsActions.refreshIfNeeded()) return;
      void sessionsActions.hydrateFromServer();
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
}
