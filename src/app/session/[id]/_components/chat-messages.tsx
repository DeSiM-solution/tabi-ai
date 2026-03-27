import type { UIMessage } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LuArrowDown } from 'react-icons/lu';

import {
  isToolPart,
  resolveToolDurationMs,
  type EditedOutputs,
} from '../_lib/chat-utils';
import type { HandbookStyleId } from '@/lib/handbook-style';

import { MessageContent } from './message-content';

const SCROLL_TO_BOTTOM_THRESHOLD_PX = 220;

type ChatMessagesProps = {
  sessionId: string;
  isSessionHydrating: boolean;
  messages: UIMessage[];
  firstUserTextMessage: { id: string; text: string } | null;
  editedToolOutputs: EditedOutputs;
  persistedToolDurations: Record<string, number>;
  handbookStyle: HandbookStyleId | null;
  isRequestBusy: boolean;
  hasRenderableHandbook: boolean;
};

export function ChatMessages({
  sessionId,
  isSessionHydrating,
  messages,
  firstUserTextMessage,
  editedToolOutputs,
  persistedToolDurations,
  handbookStyle,
  isRequestBusy,
  hasRenderableHandbook,
}: ChatMessagesProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const autoScrolledSessionRef = useRef<string | null>(null);
  const pendingAutoScrollSessionRef = useRef<string | null>(null);
  const toolStartedAtRef = useRef<Record<string, number>>({});
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const [toolDurations, setToolDurations] = useState<Record<string, number>>({});

  const stopChatScrollAnimation = useCallback(() => {
    if (scrollAnimationFrameRef.current === null) return;
    window.cancelAnimationFrame(scrollAnimationFrameRef.current);
    scrollAnimationFrameRef.current = null;
  }, []);

  const scrollChatToBottom = useCallback((durationMs = 720) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const startTop = container.scrollTop;
    const targetTop = Math.max(0, container.scrollHeight - container.clientHeight);
    if (targetTop <= startTop + 1) {
      container.scrollTop = targetTop;
      return;
    }

    stopChatScrollAnimation();
    const startTime = performance.now();
    const distance = targetTop - startTop;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const easedProgress = 1 - (1 - progress) ** 3;
      container.scrollTop = startTop + distance * easedProgress;

      if (progress < 1) {
        scrollAnimationFrameRef.current = window.requestAnimationFrame(animate);
        return;
      }

      scrollAnimationFrameRef.current = null;
    };

    scrollAnimationFrameRef.current = window.requestAnimationFrame(animate);
  }, [stopChatScrollAnimation]);

  const updateScrollToBottomButtonVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (messages.length === 0 || isSessionHydrating) {
      setShowScrollToBottomButton(false);
      return;
    }

    const distanceToBottom =
      container.scrollHeight - (container.scrollTop + container.clientHeight);
    setShowScrollToBottomButton(distanceToBottom > SCROLL_TO_BOTTOM_THRESHOLD_PX);
  }, [isSessionHydrating, messages.length]);

  useEffect(() => {
    if (!sessionId) return;
    autoScrolledSessionRef.current = null;
    pendingAutoScrollSessionRef.current = sessionId;
    toolStartedAtRef.current = {};
    const resetId = window.requestAnimationFrame(() => {
      setToolDurations({});
    });
    return () => {
      window.cancelAnimationFrame(resetId);
    };
  }, [sessionId]);

  useEffect(() => {
    const entries = Object.entries(persistedToolDurations);
    if (entries.length === 0) return;

    const mergeId = window.requestAnimationFrame(() => {
      setToolDurations(previous => {
        const next = { ...previous };
        let changed = false;
        for (const [sourceKey, durationMs] of entries) {
          if (next[sourceKey] === durationMs) continue;
          next[sourceKey] = durationMs;
          changed = true;
        }
        return changed ? next : previous;
      });
    });

    return () => {
      window.cancelAnimationFrame(mergeId);
    };
  }, [persistedToolDurations]);

  useEffect(() => {
    if (messages.length === 0) {
      toolStartedAtRef.current = {};
      return;
    }

    const now = Date.now();
    const activeSourceKeys = new Set<string>();
    const inferredDurations: Record<string, number> = {};

    for (const message of messages) {
      message.parts.forEach((part, partIndex) => {
        if (!isToolPart(part)) return;
        const sourceKey = `${message.id}:${partIndex}:${part.type}`;
        activeSourceKeys.add(sourceKey);

        const output = editedToolOutputs[sourceKey] ?? part.output;
        const embeddedDurationMs = resolveToolDurationMs(part, output);
        if (embeddedDurationMs !== null) {
          inferredDurations[sourceKey] = embeddedDurationMs;
        }

        const isFinalized = part.state === 'output-available' || part.state === 'output-error';
        if (!isFinalized) {
          if (toolStartedAtRef.current[sourceKey] === undefined) {
            toolStartedAtRef.current[sourceKey] = now;
          }
          return;
        }

        if (inferredDurations[sourceKey] === undefined) {
          const startedAt = toolStartedAtRef.current[sourceKey];
          if (startedAt !== undefined) {
            inferredDurations[sourceKey] = Math.max(0, now - startedAt);
          }
        }
        delete toolStartedAtRef.current[sourceKey];
      });
    }

    for (const sourceKey of Object.keys(toolStartedAtRef.current)) {
      if (activeSourceKeys.has(sourceKey)) continue;
      delete toolStartedAtRef.current[sourceKey];
    }

    if (Object.keys(inferredDurations).length === 0) return;
    const inferId = window.requestAnimationFrame(() => {
      setToolDurations(previous => {
        const next = { ...previous };
        let changed = false;
        for (const [sourceKey, durationMs] of Object.entries(inferredDurations)) {
          if (next[sourceKey] === durationMs) continue;
          next[sourceKey] = durationMs;
          changed = true;
        }
        return changed ? next : previous;
      });
    });
    return () => {
      window.cancelAnimationFrame(inferId);
    };
  }, [editedToolOutputs, messages]);

  useEffect(() => {
    if (!sessionId) return;
    if (pendingAutoScrollSessionRef.current !== sessionId) return;
    if (isSessionHydrating) return;
    if (messages.length === 0) return;
    if (autoScrolledSessionRef.current === sessionId) return;

    pendingAutoScrollSessionRef.current = null;
    autoScrolledSessionRef.current = sessionId;
    let rafId = 0;
    let nestedRafId = 0;
    rafId = window.requestAnimationFrame(() => {
      nestedRafId = window.requestAnimationFrame(() => {
        scrollChatToBottom();
      });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.cancelAnimationFrame(nestedRafId);
    };
  }, [isSessionHydrating, messages.length, scrollChatToBottom, sessionId]);

  useEffect(
    () => () => {
      stopChatScrollAnimation();
    },
    [stopChatScrollAnimation],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateScrollToBottomButtonVisibility();
    };
    const handleResize = () => {
      updateScrollToBottomButtonVisibility();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    const rafId = window.requestAnimationFrame(() => {
      updateScrollToBottomButtonVisibility();
    });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.cancelAnimationFrame(rafId);
    };
  }, [updateScrollToBottomButtonVisibility]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      updateScrollToBottomButtonVisibility();
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [messages, updateScrollToBottomButtonVisibility]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollContainerRef} className="h-full overflow-y-auto px-4 py-4">
        {firstUserTextMessage && (
          <div className="sticky top-0 z-20 mb-4 -mx-1 px-1 pb-1 pt-0">
            <div className="rounded-[12px] bg-accent-primary px-4 py-4 shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
              <p className="whitespace-pre-wrap break-words text-[13px] font-medium leading-[1.55] text-text-inverse">
                {firstUserTextMessage.text}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-[13px] text-text-tertiary">
              Paste a YouTube travel video link to start.
            </p>
          )}
          {messages.map(message => {
            const isUser = message.role === 'user';
            const isSystem = message.role === 'system';
            if (firstUserTextMessage && isUser && message.id === firstUserTextMessage.id) {
              return null;
            }

            return (
              <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`${
                    isUser
                      ? 'max-w-[92%] rounded-[12px] bg-accent-primary px-4 py-4 text-text-inverse'
                      : isSystem
                        ? 'max-w-[92%] rounded-[12px] border border-border-light bg-bg-secondary px-4 py-3 text-text-secondary'
                        : 'w-full max-w-full text-text-primary'
                  }`}
                >
                  {isSystem && (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-secondary">
                      System
                    </p>
                  )}
                  <MessageContent
                    message={message}
                    editedToolOutputs={editedToolOutputs}
                  toolDurations={toolDurations}
                  handbookStyle={handbookStyle}
                  isRequestBusy={isRequestBusy}
                  hasRenderableHandbook={hasRenderableHandbook}
                />
              </div>
            </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {showScrollToBottomButton ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              scrollChatToBottom();
            }}
            aria-label="scroll to latest message"
            className="absolute bottom-2 left-1/2 z-30 inline-flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-[9px] border border-border-light bg-bg-elevated text-text-secondary shadow-[0_8px_22px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:text-text-primary"
          >
            <LuArrowDown className="h-3.5 w-3.5" />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
