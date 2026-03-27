import { useCallback, useEffect, useRef, useState } from 'react';

type RouterLike = {
  push: (href: string) => void;
};

type UseUnsavedGuardArgs = {
  isDirty: boolean;
  router: RouterLike;
  resetKey: string;
};

export function useUnsavedGuard({
  isDirty,
  router,
  resetKey,
}: UseUnsavedGuardArgs) {
  const [leaveConfirmState, setLeaveConfirmState] = useState({
    isOpen: false,
    resetKey,
  });
  const isDirtyRef = useRef(isDirty);
  const allowUnsafeLeaveRef = useRef(false);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);
  const suppressNextPopStateRef = useRef(false);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    pendingLeaveActionRef.current = null;
    allowUnsafeLeaveRef.current = false;
    suppressNextPopStateRef.current = false;
  }, [resetKey]);

  const requestLeaveWithUnsavedWarning = useCallback((action: () => void) => {
    pendingLeaveActionRef.current = action;
    setLeaveConfirmState({
      isOpen: true,
      resetKey,
    });
  }, [resetKey]);

  const cancelLeaveWithUnsavedWarning = useCallback(() => {
    pendingLeaveActionRef.current = null;
    setLeaveConfirmState({
      isOpen: false,
      resetKey,
    });
  }, [resetKey]);

  const confirmLeaveWithUnsavedWarning = useCallback(() => {
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    setLeaveConfirmState({
      isOpen: false,
      resetKey,
    });
    allowUnsafeLeaveRef.current = true;
    action?.();

    window.setTimeout(() => {
      allowUnsafeLeaveRef.current = false;
    }, 1000);
  }, [resetKey]);

  const isLeaveConfirmOpen =
    leaveConfirmState.isOpen && leaveConfirmState.resetKey === resetKey;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current || allowUnsafeLeaveRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!isDirtyRef.current || allowUnsafeLeaveRef.current) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as Element | null;
      if (!target) return;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target.toLowerCase() !== '_self') return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, currentUrl);
      if (nextUrl.href === currentUrl.href) return;

      event.preventDefault();
      requestLeaveWithUnsavedWarning(() => {
        const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
        if (nextUrl.origin !== currentUrl.origin) {
          window.location.assign(nextUrl.toString());
          return;
        }
        router.push(nextPath);
      });
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [requestLeaveWithUnsavedWarning, router]);

  useEffect(() => {
    const handlePopState = () => {
      if (suppressNextPopStateRef.current) {
        suppressNextPopStateRef.current = false;
        return;
      }
      if (!isDirtyRef.current || allowUnsafeLeaveRef.current) return;

      window.history.go(1);
      requestLeaveWithUnsavedWarning(() => {
        suppressNextPopStateRef.current = true;
        window.history.back();
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [requestLeaveWithUnsavedWarning]);

  return {
    isLeaveConfirmOpen,
    cancelLeaveWithUnsavedWarning,
    confirmLeaveWithUnsavedWarning,
  };
}
