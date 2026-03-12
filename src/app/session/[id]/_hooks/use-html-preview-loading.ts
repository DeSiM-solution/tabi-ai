import { useCallback, useEffect, useRef, useState } from 'react';

type HtmlPreviewLoadPhase = 'idle' | 'loading' | 'revealing';

type UseHtmlPreviewLoadingArgs = {
  centerViewMode: 'blocks' | 'html';
  isSessionHydrating: boolean;
  handbookPreviewUrl: string | null;
  handbookHtml: string | null;
};

export function useHtmlPreviewLoading({
  centerViewMode,
  isSessionHydrating,
  handbookPreviewUrl,
  handbookHtml,
}: UseHtmlPreviewLoadingArgs) {
  const [htmlPreviewLoadPhase, setHtmlPreviewLoadPhase] =
    useState<HtmlPreviewLoadPhase>('idle');
  const htmlPreviewRevealTimerRef = useRef<number | null>(null);

  const clearHtmlPreviewRevealTimer = useCallback(() => {
    if (htmlPreviewRevealTimerRef.current !== null) {
      window.clearTimeout(htmlPreviewRevealTimerRef.current);
      htmlPreviewRevealTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isSessionHydrating || centerViewMode !== 'html') {
      clearHtmlPreviewRevealTimer();
      setHtmlPreviewLoadPhase('idle');
      return;
    }
    if (!handbookPreviewUrl && !handbookHtml) {
      clearHtmlPreviewRevealTimer();
      setHtmlPreviewLoadPhase('idle');
      return;
    }
    clearHtmlPreviewRevealTimer();
    setHtmlPreviewLoadPhase('loading');
  }, [
    centerViewMode,
    clearHtmlPreviewRevealTimer,
    handbookHtml,
    handbookPreviewUrl,
    isSessionHydrating,
  ]);

  useEffect(
    () => () => {
      clearHtmlPreviewRevealTimer();
    },
    [clearHtmlPreviewRevealTimer],
  );

  useEffect(() => {
    if (htmlPreviewLoadPhase !== 'revealing') return;
    clearHtmlPreviewRevealTimer();
    htmlPreviewRevealTimerRef.current = window.setTimeout(() => {
      setHtmlPreviewLoadPhase('idle');
      htmlPreviewRevealTimerRef.current = null;
    }, 520);
    return () => {
      clearHtmlPreviewRevealTimer();
    };
  }, [clearHtmlPreviewRevealTimer, htmlPreviewLoadPhase]);

  const handleHtmlPreviewLoad = useCallback(() => {
    setHtmlPreviewLoadPhase(previous => {
      if (previous === 'idle') return previous;
      return 'revealing';
    });
  }, []);

  const resetHtmlPreviewLoadPhase = useCallback(() => {
    clearHtmlPreviewRevealTimer();
    setHtmlPreviewLoadPhase('idle');
  }, [clearHtmlPreviewRevealTimer]);

  const hasHtmlPreviewSource = Boolean(handbookPreviewUrl || handbookHtml);
  const showHtmlPreviewOverlay =
    hasHtmlPreviewSource &&
    (htmlPreviewLoadPhase === 'loading' || htmlPreviewLoadPhase === 'revealing');
  const previewFrameOpacityClass =
    htmlPreviewLoadPhase === 'loading' ? 'opacity-0' : 'opacity-100';

  return {
    htmlPreviewLoadPhase,
    showHtmlPreviewOverlay,
    previewFrameOpacityClass,
    handleHtmlPreviewLoad,
    resetHtmlPreviewLoadPhase,
  };
}
