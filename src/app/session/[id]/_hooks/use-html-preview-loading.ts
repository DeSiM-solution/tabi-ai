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
  const [loadedPreviewKey, setLoadedPreviewKey] = useState<string | null>(null);
  const [isRevealingPreview, setIsRevealingPreview] = useState(false);
  const htmlPreviewRevealTimerRef = useRef<number | null>(null);
  const activePreviewKey =
    !isSessionHydrating && centerViewMode === 'html'
      ? handbookPreviewUrl ?? handbookHtml ?? null
      : null;

  const clearHtmlPreviewRevealTimer = useCallback(() => {
    if (htmlPreviewRevealTimerRef.current !== null) {
      window.clearTimeout(htmlPreviewRevealTimerRef.current);
      htmlPreviewRevealTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!activePreviewKey) {
      clearHtmlPreviewRevealTimer();
    }
  }, [activePreviewKey, clearHtmlPreviewRevealTimer]);

  useEffect(() => {
    clearHtmlPreviewRevealTimer();
  }, [clearHtmlPreviewRevealTimer, activePreviewKey]);

  useEffect(
    () => () => {
      clearHtmlPreviewRevealTimer();
    },
    [clearHtmlPreviewRevealTimer],
  );

  const handleHtmlPreviewLoad = useCallback(() => {
    if (!activePreviewKey) return;

    clearHtmlPreviewRevealTimer();
    setLoadedPreviewKey(activePreviewKey);
    setIsRevealingPreview(true);
    htmlPreviewRevealTimerRef.current = window.setTimeout(() => {
      setIsRevealingPreview(false);
      htmlPreviewRevealTimerRef.current = null;
    }, 520);
  }, [activePreviewKey, clearHtmlPreviewRevealTimer]);

  const resetHtmlPreviewLoadPhase = useCallback(() => {
    clearHtmlPreviewRevealTimer();
    setLoadedPreviewKey(activePreviewKey);
    setIsRevealingPreview(false);
  }, [activePreviewKey, clearHtmlPreviewRevealTimer]);

  const htmlPreviewLoadPhase: HtmlPreviewLoadPhase =
    !activePreviewKey
      ? 'idle'
      : loadedPreviewKey !== activePreviewKey
        ? 'loading'
        : isRevealingPreview
          ? 'revealing'
          : 'idle';
  const hasHtmlPreviewSource = Boolean(activePreviewKey);
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
