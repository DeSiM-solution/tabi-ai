'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import {
  LuArchive,
  LuChevronDown,
  LuCode,
  LuDownload,
  LuExternalLink,
  LuFileText,
  LuFilePenLine,
  LuGlobe,
  LuLoader,
  LuMonitor,
  LuPencil,
  LuRefreshCw,
  LuSave,
  LuSmartphone,
  LuSparkles,
  LuTrash2,
} from 'react-icons/lu';
import { toast } from 'sonner';
import {
  getHandbookLifecycleLabel,
  type HandbookLifecycle,
} from '@/lib/handbook-lifecycle';
import {
  useSessionsStore,
  sessionsActions,
} from '@/stores/sessions-store';
import {
  handbooksActions,
  handbooksStore,
  useSessionHandbooksState,
} from '@/stores/handbooks-store';
import { useAuthStore } from '@/stores/auth-store';
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog';
import { RenameDialog } from '@/components/rename-dialog';
import {
  SessionContextMenu,
  type SessionContextMenuState,
} from '@/components/session-context-menu';
import { useSessionStore } from '@/stores/session-store';
import { useHydrateSessionsStore } from '@/stores/use-hydrate-sessions-store';
import { SessionSidebar } from '@/components/session-sidebar';
import {
  sessionEditorActions,
  useSessionEditorSnapshot,
} from './_stores/session-editor-store';
import {
  CENTER_TOOLBAR_ACTION_EVENT,
  type CenterToolbarAction,
  type CenterToolbarActionDetail,
} from './_lib/center-toolbar-actions';

const CHAT_PANEL_MIN_WIDTH = 300;
const CHAT_PANEL_MAX_WIDTH = 500;
const CHAT_PANEL_DEFAULT_WIDTH = 430;
const TOOLBAR_TOOLTIP_OFFSET = 10;

export default function SessionDetailLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const activeSessionId = typeof params.id === 'string' ? params.id : '';
  const { sessionItems, sessionsLoading } = useSessionsStore(state => ({
    sessionItems: state.sessions,
    sessionsLoading: state.loading,
  }));
  const {
    centerViewMode,
    editorSession,
    activeHandbookId: activeHandbookIdFromEditor,
    handbookHtml,
    handbookPreviewUrl,
    previewDevice,
  } =
    useSessionEditorSnapshot(activeSessionId);
  const activeSessionHandbooksState = useSessionHandbooksState(activeSessionId);
  const activeHandbookId =
    activeHandbookIdFromEditor
    ?? activeSessionHandbooksState.activeHandbookId
    ?? null;
  const activeHandbook =
    activeSessionHandbooksState.handbooks.find(
      handbook => handbook.id === activeHandbookId,
    )
    ?? null;
  const hasBlocks = Boolean(editorSession);
  const hasHtml = Boolean(
    handbookHtml
    || handbookPreviewUrl
    || activeHandbook?.previewPath,
  );
  const handbookLifecycle =
    activeHandbook?.lifecycle
    ?? 'DRAFT';
  const isHandbookPublic = handbookLifecycle === 'PUBLIC';
  const guidePreviewPath = activeHandbookId
    ? `/api/guide/${activeHandbookId}`
    : activeSessionId
      ? `/api/guide/${activeSessionId}`
      : null;
  const previewTarget = handbookPreviewUrl || guidePreviewPath;
  const isProcessBusy = useSessionStore(state => state.loading);
  const isGuestUser = useAuthStore(state => state.user?.isGuest ?? true);
  const [contextMenu, setContextMenu] = useState<SessionContextMenuState | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(
    null,
  );
  const [pendingDeleteHandbookId, setPendingDeleteHandbookId] = useState<string | null>(
    null,
  );
  const [pendingRenameHandbookId, setPendingRenameHandbookId] = useState<string | null>(
    null,
  );
  const [renameDraft, setRenameDraft] = useState('');
  const [renameHandbookDraft, setRenameHandbookDraft] = useState('');
  const [chatPanelWidth, setChatPanelWidth] = useState(CHAT_PANEL_DEFAULT_WIDTH);
  const [isResizingChatPanel, setIsResizingChatPanel] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUpdatingLifecycle, setIsUpdatingLifecycle] = useState(false);
  const [isHandbookMenuOpen, setIsHandbookMenuOpen] = useState(false);
  const [isRemovingHandbook, setIsRemovingHandbook] = useState(false);
  const [isRenamingHandbook, setIsRenamingHandbook] = useState(false);
  const [toolbarTooltip, setToolbarTooltip] = useState<{
    label: string;
    top: number;
    left: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const handbookMenuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const chatResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  useHydrateSessionsStore();
  const pendingDeleteSession = pendingDeleteSessionId
    ? (sessionItems.find(item => item.id === pendingDeleteSessionId) ?? null)
    : null;
  const pendingDeleteHandbook = pendingDeleteHandbookId
    ? (
      activeSessionHandbooksState.handbooks.find(
        handbook => handbook.id === pendingDeleteHandbookId,
      ) ?? null
    )
    : null;
  const pendingRenameHandbook = pendingRenameHandbookId
    ? (
      activeSessionHandbooksState.handbooks.find(
        handbook => handbook.id === pendingRenameHandbookId,
      ) ?? null
    )
    : null;

  useEffect(() => {
    if (!activeSessionId) return;
    handbooksActions.ensureSession(activeSessionId);
    if (!handbooksActions.refreshIfNeeded(activeSessionId)) return;
    void handbooksActions.hydrateSession(activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;
    if (activeSessionHandbooksState.activeHandbookId === activeHandbookIdFromEditor) return;
    sessionEditorActions.setActiveHandbookId(
      activeSessionId,
      activeSessionHandbooksState.activeHandbookId,
    );
  }, [
    activeHandbookIdFromEditor,
    activeSessionHandbooksState.activeHandbookId,
    activeSessionId,
  ]);

  useEffect(() => {
    if (!activeSessionId) return;
    if (activeHandbookId) return;
    if (centerViewMode !== 'html') return;
    sessionEditorActions.setCenterViewMode(activeSessionId, 'blocks');
  }, [activeHandbookId, activeSessionId, centerViewMode]);

  useEffect(() => {
    if (centerViewMode !== 'blocks') return;
    setIsHandbookMenuOpen(false);
  }, [centerViewMode]);

  useEffect(() => {
    setToolbarTooltip(null);
  }, [centerViewMode]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  useEffect(() => {
    if (!isResizingChatPanel) return;

    const onMouseMove = (event: MouseEvent) => {
      const resizeState = chatResizeStateRef.current;
      if (!resizeState) return;
      const deltaX = event.clientX - resizeState.startX;
      const nextWidth = Math.min(
        CHAT_PANEL_MAX_WIDTH,
        Math.max(CHAT_PANEL_MIN_WIDTH, resizeState.startWidth - deltaX),
      );
      setChatPanelWidth(nextWidth);
    };

    const stopResize = () => {
      setIsResizingChatPanel(false);
      chatResizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('blur', stopResize);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopResize);
      window.removeEventListener('blur', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingChatPanel]);

  useEffect(() => {
    if (!renamingSessionId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingSessionId]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      setContextMenu(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setContextMenu(null);
    };

    const closeOnScroll = () => setContextMenu(null);

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('blur', closeOnScroll);

    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('blur', closeOnScroll);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!isHandbookMenuOpen) return;

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && handbookMenuRef.current?.contains(target)) return;
      setIsHandbookMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsHandbookMenuOpen(false);
    };

    const closeOnScroll = () => setIsHandbookMenuOpen(false);

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('blur', closeOnScroll);

    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('blur', closeOnScroll);
    };
  }, [isHandbookMenuOpen]);

  useEffect(() => {
    if (!toolbarTooltip) return;

    const hideTooltip = () => setToolbarTooltip(null);
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
    window.addEventListener('blur', hideTooltip);

    return () => {
      window.removeEventListener('scroll', hideTooltip, true);
      window.removeEventListener('resize', hideTooltip);
      window.removeEventListener('blur', hideTooltip);
    };
  }, [toolbarTooltip]);

  const openSessionContextMenu = (
    event: React.MouseEvent<HTMLElement>,
    sessionId: string,
  ) => {
    event.preventDefault();

    const menuWidth = 208;
    const menuHeight = 242;
    const x = Math.min(event.clientX + 8, window.innerWidth - menuWidth - 8);
    const y = Math.min(event.clientY + 8, window.innerHeight - menuHeight - 8);
    setContextMenu({
      sessionId,
      x: Math.max(8, x),
      y: Math.max(8, y),
    });
  };

  const startRenameSession = (sessionId: string) => {
    const session = sessionItems.find(item => item.id === sessionId);
    if (!session) return;
    setIsSidebarCollapsed(false);
    setContextMenu(null);
    setRenamingSessionId(sessionId);
    setRenameDraft(session.title);
  };

  const cancelRenameSession = () => {
    setRenamingSessionId(null);
    setRenameDraft('');
  };

  const commitRenameSession = (sessionId: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    sessionsActions.updateSession(sessionId, { title: trimmed });
    cancelRenameSession();
  };

  const requestDeleteSession = (sessionId: string) => {
    const target = sessionItems.find(item => item.id === sessionId);
    if (!target) return;

    setContextMenu(null);
    if (renamingSessionId === sessionId) {
      cancelRenameSession();
    }
    setPendingDeleteSessionId(sessionId);
  };

  const confirmDeleteSession = () => {
    if (!pendingDeleteSession) {
      setPendingDeleteSessionId(null);
      return;
    }

    const deletedSessionId = pendingDeleteSession.id;
    setPendingDeleteSessionId(null);
    const nextSessionId =
      sessionItems.find(item => item.id !== deletedSessionId)?.id ?? null;
    sessionsActions.removeSession(deletedSessionId);

    if (activeSessionId === deletedSessionId) {
      if (nextSessionId) {
        router.push(`/session/${nextSessionId}`);
      } else {
        router.push('/');
      }
    }
  };

  const refreshPreview = () => {
    if (!activeSessionId) return;
    const base = (handbookPreviewUrl ?? guidePreviewPath)?.split('?')[0];
    if (!base) return;

    sessionEditorActions.setHandbookPreviewUrl(
      activeSessionId,
      `${base}?v=${Date.now()}`,
      activeHandbookId,
    );
    sessionEditorActions.setCenterViewMode(activeSessionId, 'html');
  };

  const openPreviewInNewTab = () => {
    if (!previewTarget) return;
    window.open(previewTarget, '_blank', 'noopener,noreferrer');
  };

  const updateHandbookLifecycle = async (
    sessionId: string,
    handbookId: string | null,
    nextLifecycle: HandbookLifecycle,
  ) => {
    if (!sessionId || isUpdatingLifecycle) return;
    const previousLifecycle = activeHandbook?.lifecycle ?? 'DRAFT';
    if (nextLifecycle === previousLifecycle) return;

    if (nextLifecycle === 'PUBLIC' && !hasHtml) {
      toast.error('Generate handbook HTML before publishing.');
      return;
    }
    if (!handbookId) {
      toast.error('No active handbook found for this session.');
      return;
    }

    setIsUpdatingLifecycle(true);
    setIsHandbookMenuOpen(false);
    setContextMenu(null);
    try {
      await handbooksActions.setHandbookLifecycle(sessionId, handbookId, nextLifecycle);
      toast.success(`Handbook moved to ${getHandbookLifecycleLabel(nextLifecycle)}.`);
    } catch (error) {
      console.error('[session-layout] update-handbook-lifecycle-failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update handbook lifecycle.');
    } finally {
      setIsUpdatingLifecycle(false);
    }
  };

  const requestRenameActiveHandbook = () => {
    if (!activeHandbookId || !activeHandbook || isRenamingHandbook) return;
    setPendingRenameHandbookId(activeHandbookId);
    setRenameHandbookDraft(activeHandbook.title || '');
    setIsHandbookMenuOpen(false);
  };

  const cancelRenameActiveHandbook = () => {
    setPendingRenameHandbookId(null);
    setRenameHandbookDraft('');
  };

  const confirmRenameActiveHandbook = async () => {
    if (!activeSessionId || !pendingRenameHandbookId) return;
    const originalTitle = pendingRenameHandbook?.title || '';
    const trimmed = renameHandbookDraft.trim();
    if (!trimmed || trimmed === originalTitle.trim()) {
      cancelRenameActiveHandbook();
      return;
    }

    setIsRenamingHandbook(true);
    try {
      await handbooksActions.updateHandbook(activeSessionId, pendingRenameHandbookId, {
        title: trimmed,
      });
      toast.success('Handbook renamed.');
      cancelRenameActiveHandbook();
    } catch (error) {
      console.error('[session-layout] rename-handbook-failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to rename handbook.');
    } finally {
      setIsRenamingHandbook(false);
      setIsHandbookMenuOpen(false);
    }
  };

  const requestDeleteActiveHandbook = () => {
    if (!activeHandbookId || isRemovingHandbook) return;
    setIsHandbookMenuOpen(false);
    setPendingDeleteHandbookId(activeHandbookId);
  };

  const confirmDeleteActiveHandbook = async () => {
    if (!activeSessionId || !pendingDeleteHandbookId) return;
    const targetHandbookId = pendingDeleteHandbookId;
    setPendingDeleteHandbookId(null);
    setIsRemovingHandbook(true);
    try {
      const removed = await handbooksActions.removeHandbook(activeSessionId, targetHandbookId);
      if (!removed) {
        toast.error('Handbook not found.');
        return;
      }
      sessionEditorActions.removeHandbookState(activeSessionId, targetHandbookId);
      const nextActiveHandbookId =
        handbooksStore.getState().bySessionId[activeSessionId]?.activeHandbookId ?? null;
      sessionEditorActions.setActiveHandbookId(activeSessionId, nextActiveHandbookId);
      if (!nextActiveHandbookId) {
        sessionEditorActions.setCenterViewMode(activeSessionId, 'blocks');
      }
      toast.success('Handbook deleted.');
    } catch (error) {
      console.error('[session-layout] delete-handbook-failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete handbook.');
    } finally {
      setIsRemovingHandbook(false);
      setIsHandbookMenuOpen(false);
    }
  };

  const dispatchCenterToolbarAction = (action: CenterToolbarAction) => {
    if (!activeSessionId) return;
    setToolbarTooltip(null);
    if (action === 'save' && isGuestUser) {
      toast.warning('Please login to continue.', {
        description: 'Saving blocks requires an account login.',
      });
      return;
    }
    window.dispatchEvent(
      new CustomEvent<CenterToolbarActionDetail>(CENTER_TOOLBAR_ACTION_EVENT, {
        detail: {
          action,
          sessionId: activeSessionId,
        },
      }),
    );
  };

  const showToolbarTooltip = (
    label: string,
    event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rawLeft = rect.left + rect.width / 2;
    const minLeft = 16;
    const maxLeft = window.innerWidth - 16;
    setToolbarTooltip({
      label,
      top: rect.bottom + TOOLBAR_TOOLTIP_OFFSET,
      left: Math.min(maxLeft, Math.max(minLeft, rawLeft)),
    });
  };

  const hideToolbarTooltip = () => {
    setToolbarTooltip(null);
  };

  const startResizeChatPanel = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    chatResizeStateRef.current = {
      startX: event.clientX,
      startWidth: chatPanelWidth,
    };
    setIsResizingChatPanel(true);
    event.preventDefault();
  };

  return (
    <div className="h-screen overflow-hidden bg-bg-primary text-text-primary">
      <div className="flex h-full overflow-hidden">
        <SessionSidebar
          variant="detail"
          sessionItems={sessionItems}
          sessionsLoading={sessionsLoading}
          activeSessionId={activeSessionId}
          isCollapsed={isSidebarCollapsed}
          onExpand={() => setIsSidebarCollapsed(false)}
          onCollapse={() => setIsSidebarCollapsed(true)}
          newSessionHref="/"
          newSessionAriaLabel="Back to home"
          onSessionContextMenu={openSessionContextMenu}
          renamingSessionId={renamingSessionId}
          renameDraft={renameDraft}
          renameInputRef={renameInputRef}
          onRenameDraftChange={setRenameDraft}
          onRenameSubmit={commitRenameSession}
          onRenameCancel={cancelRenameSession}
        />

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <section className="ui-page-enter-down hidden min-h-0 min-w-0 flex-1 flex-col lg:flex">
            <div className="relative z-20 px-5 pt-2">
              <div className="mx-auto flex h-[64px] items-center justify-center">
                <div className="flex w-fit items-center gap-1.5 rounded-[14px] border border-border-light bg-bg-elevated px-1.5 py-1 shadow-[0_8px_24px_rgba(45,42,38,0.08)]">
                  <div className="flex items-center gap-0.5 rounded-[8px] bg-bg-secondary p-[3px]">
                    <button
                      type="button"
                      onClick={() =>
                        sessionEditorActions.setCenterViewMode(activeSessionId, 'blocks')
                      }
                      disabled={!hasBlocks}
                      className={`inline-flex h-10 items-center gap-[5px] rounded-[8px] px-[12px] text-[12px] font-medium transition-colors ${
                        centerViewMode === 'blocks'
                          ? 'bg-bg-elevated text-text-primary'
                          : 'bg-transparent text-text-tertiary hover:text-text-secondary'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <LuFileText className="h-[14px] w-[14px]" />
                      Blocks
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        sessionEditorActions.setCenterViewMode(activeSessionId, 'html')
                      }
                      disabled={!hasHtml}
                      className={`inline-flex h-10 items-center gap-[5px] rounded-[8px] px-[12px] text-[12px] font-medium transition-colors ${
                        centerViewMode === 'html'
                          ? 'bg-bg-elevated text-text-primary'
                          : 'bg-transparent text-text-tertiary hover:text-text-secondary'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <LuCode className="h-[14px] w-[14px]" />
                      Handbook
                    </button>
                  </div>

                  {centerViewMode === 'html' ? (
                    <>
                      <div className="flex items-center gap-0.5 rounded-[8px] bg-bg-secondary p-[3px]">
                        <button
                          type="button"
                          onClick={() =>
                            sessionEditorActions.setPreviewDevice(activeSessionId, 'desktop')
                          }
                          onMouseEnter={event => showToolbarTooltip('Desktop View', event)}
                          onMouseLeave={hideToolbarTooltip}
                          onFocus={event => showToolbarTooltip('Desktop View', event)}
                          onBlur={hideToolbarTooltip}
                          aria-pressed={previewDevice === 'desktop'}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-[8px] text-[12px] font-medium transition-colors ${
                            previewDevice === 'desktop'
                              ? 'bg-bg-elevated text-text-primary'
                              : 'bg-transparent text-text-tertiary hover:text-text-secondary'
                          }`}
                        >
                          <LuMonitor className="h-[14px] w-[14px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            sessionEditorActions.setPreviewDevice(activeSessionId, 'mobile')
                          }
                          onMouseEnter={event => showToolbarTooltip('Mobile View', event)}
                          onMouseLeave={hideToolbarTooltip}
                          onFocus={event => showToolbarTooltip('Mobile View', event)}
                          onBlur={hideToolbarTooltip}
                          aria-pressed={previewDevice === 'mobile'}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-[8px] text-[12px] font-medium transition-colors ${
                            previewDevice === 'mobile'
                              ? 'bg-bg-elevated text-text-primary'
                              : 'bg-transparent text-text-tertiary hover:text-text-secondary'
                          }`}
                        >
                          <LuSmartphone className="h-[14px] w-[14px]" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={refreshPreview}
                        onMouseEnter={event => showToolbarTooltip('Refresh Handbook', event)}
                        onMouseLeave={hideToolbarTooltip}
                        onFocus={event => showToolbarTooltip('Refresh Handbook', event)}
                        onBlur={hideToolbarTooltip}
                        disabled={!hasHtml}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[#6B6560] transition hover:bg-bg-primary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Refresh"
                      >
                        <LuRefreshCw className="h-[18px] w-[18px]" />
                      </button>
                      <button
                        type="button"
                        onClick={openPreviewInNewTab}
                        onMouseEnter={event =>
                          showToolbarTooltip('Open handbook in new tab', event)
                        }
                        onMouseLeave={hideToolbarTooltip}
                        onFocus={event =>
                          showToolbarTooltip('Open handbook in new tab', event)
                        }
                        onBlur={hideToolbarTooltip}
                        disabled={!hasHtml}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#F0FDFA] text-[#0D9488] transition hover:bg-[#CCFBF1] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Open in new tab"
                      >
                        <LuExternalLink className="h-[18px] w-[18px]" />
                      </button>
                      <div className="relative" ref={handbookMenuRef}>
                        <div className="inline-flex h-10 overflow-hidden rounded-[10px] bg-[#0D9488] text-text-inverse">
                          <button
                            type="button"
                            onClick={() => {
                              setIsHandbookMenuOpen(false);
                              void updateHandbookLifecycle(
                                activeSessionId,
                                activeHandbookId,
                                'PUBLIC',
                              );
                            }}
                            onMouseEnter={event => showToolbarTooltip('Publish Handbook', event)}
                            onMouseLeave={hideToolbarTooltip}
                            onFocus={event => showToolbarTooltip('Publish Handbook', event)}
                            onBlur={hideToolbarTooltip}
                            disabled={!activeHandbookId || isHandbookPublic || !hasHtml || isUpdatingLifecycle}
                            className="inline-flex h-10 items-center gap-2 px-[14px] text-[13px] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {isUpdatingLifecycle ? (
                              <LuLoader className="h-4 w-4 animate-spin" />
                              ) : (
                                <LuGlobe className="h-4 w-4" />
                              )}
                            {isHandbookPublic
                              ? 'Public'
                              : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsHandbookMenuOpen(open => !open)}
                            disabled={!activeHandbookId || isUpdatingLifecycle || isRemovingHandbook}
                            className="inline-flex h-10 w-[34px] items-center justify-center border-l border-white/35 bg-[#0D9488] transition hover:bg-[#0B7F75] disabled:cursor-not-allowed disabled:opacity-45"
                            aria-label="Handbook menu"
                          >
                            <LuChevronDown
                              className={`h-4 w-4 transition-transform ${
                                isHandbookMenuOpen ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>
                        {isHandbookMenuOpen && (
                          <div className="absolute right-0 top-[44px] z-40 min-w-[170px] overflow-hidden rounded-[8px] border border-border-light bg-bg-elevated p-1 shadow-[0_8px_24px_rgba(45,42,38,0.12)]">
                            <button
                              type="button"
                              onClick={requestRenameActiveHandbook}
                              disabled={!activeHandbookId || isRemovingHandbook || isRenamingHandbook}
                              className="flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-[13px] text-text-primary transition hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <LuPencil className="h-[15px] w-[15px] text-[#6B6560]" />
                              <span>Rename</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void updateHandbookLifecycle(activeSessionId, activeHandbookId, 'PUBLIC')
                              }
                              disabled={!activeHandbookId || handbookLifecycle === 'PUBLIC' || isUpdatingLifecycle || isRemovingHandbook || !hasHtml}
                              className="flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-[13px] text-text-primary transition hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <LuGlobe className="h-[15px] w-[15px] text-[#6B6560]" />
                              <span>Set Public</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void updateHandbookLifecycle(activeSessionId, activeHandbookId, 'DRAFT')
                              }
                              disabled={!activeHandbookId || handbookLifecycle === 'DRAFT' || isUpdatingLifecycle || isRemovingHandbook}
                              className="flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-[13px] text-text-primary transition hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <LuFilePenLine className="h-[15px] w-[15px] text-[#6B6560]" />
                              <span>Move to Draft</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void updateHandbookLifecycle(activeSessionId, activeHandbookId, 'ARCHIVED')
                              }
                              disabled={!activeHandbookId || handbookLifecycle === 'ARCHIVED' || isUpdatingLifecycle || isRemovingHandbook}
                              className="flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-[13px] text-text-primary transition hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <LuArchive className="h-[15px] w-[15px] text-[#6B6560]" />
                              <span>Archive</span>
                            </button>
                            <div className="mx-1 my-1 h-px bg-border-light" />
                            <button
                              type="button"
                              onClick={requestDeleteActiveHandbook}
                              disabled={!activeHandbookId || isRemovingHandbook}
                              className="flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-[13px] text-accent-secondary transition hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <LuTrash2 className="h-[15px] w-[15px]" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => dispatchCenterToolbarAction('export')}
                        onMouseEnter={event =>
                          showToolbarTooltip('Export Google Map CSV', event)
                        }
                        onMouseLeave={hideToolbarTooltip}
                        onFocus={event =>
                          showToolbarTooltip('Export Google Map CSV', event)
                        }
                        onBlur={hideToolbarTooltip}
                        disabled={!hasBlocks}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Export Google Map CSV"
                      >
                        <LuDownload className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatchCenterToolbarAction('save')}
                        onMouseEnter={event => showToolbarTooltip('Save Block Data', event)}
                        onMouseLeave={hideToolbarTooltip}
                        onFocus={event => showToolbarTooltip('Save Block Data', event)}
                        onBlur={hideToolbarTooltip}
                        disabled={!hasBlocks}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-primary-bg text-accent-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Save Block Data"
                      >
                        <LuSave className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatchCenterToolbarAction('generate')}
                        onMouseEnter={event => showToolbarTooltip('Remix Handbook', event)}
                        onMouseLeave={hideToolbarTooltip}
                        onFocus={event => showToolbarTooltip('Remix Handbook', event)}
                        onBlur={hideToolbarTooltip}
                        disabled={!hasBlocks || isProcessBusy}
                        className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-accent-primary px-3.5 text-[13px] font-medium text-text-inverse transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-border-default disabled:text-text-tertiary"
                        aria-label="Remix Handbook"
                      >
                        <LuSparkles className="h-4 w-4" />
                        Remix
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 px-6 pb-4 pt-1">
              <div className="relative h-full overflow-hidden">
                <div id="block-editor-panel-root" className="absolute inset-0" />
              </div>
            </div>
          </section>

          <div
            role="separator"
            aria-label="Resize chat panel"
            aria-orientation="vertical"
            onMouseDown={startResizeChatPanel}
            className="hidden w-2 shrink-0 cursor-col-resize items-center justify-center border-l border-border-light bg-bg-elevated lg:flex"
          >
            <span
              className={`h-10 w-1 rounded-[2px] ${
                isResizingChatPanel ? 'bg-accent-primary' : 'bg-border-default'
              }`}
            />
          </div>

          <aside
            className="h-screen w-full shrink-0 overflow-hidden bg-bg-elevated lg:min-w-[300px] lg:max-w-[500px] lg:w-[var(--chat-panel-width)]"
            style={{
              ['--chat-panel-width' as string]: `${chatPanelWidth}px`,
            }}
          >
            {children}
          </aside>
        </div>
      </div>

      {typeof document !== 'undefined' && toolbarTooltip
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[220] whitespace-nowrap rounded-[6px] bg-[rgba(17,24,39,0.92)] px-2 py-1 text-[11px] font-medium leading-none text-white shadow-[0_6px_16px_rgba(15,23,42,0.35)]"
              style={{
                top: toolbarTooltip.top,
                left: toolbarTooltip.left,
                transform: 'translateX(-50%)',
              }}
            >
              {toolbarTooltip.label}
            </div>,
            document.body,
          )
        : null}

      <SessionContextMenu
        menu={contextMenu}
        menuRef={menuRef}
        onRename={startRenameSession}
        onDelete={requestDeleteSession}
      />
      <DeleteConfirmationDialog
        open={Boolean(pendingDeleteHandbookId)}
        title="Delete Handbook?"
        description={`Delete ${
          (pendingDeleteHandbook?.title || '').trim() || 'this handbook'
        }? This cannot be undone.`}
        confirmLabel="Delete"
        confirmDisabled={isRemovingHandbook}
        onCancel={() => setPendingDeleteHandbookId(null)}
        onConfirm={confirmDeleteActiveHandbook}
      />
      <RenameDialog
        open={Boolean(pendingRenameHandbookId)}
        title="Rename Handbook"
        description="Set a new handbook name."
        value={renameHandbookDraft}
        placeholder="Handbook name"
        confirmLabel="Save"
        confirmDisabled={isRenamingHandbook || renameHandbookDraft.trim().length === 0}
        onChange={setRenameHandbookDraft}
        onCancel={cancelRenameActiveHandbook}
        onConfirm={() => void confirmRenameActiveHandbook()}
      />
      <DeleteConfirmationDialog
        open={Boolean(pendingDeleteSession)}
        title="Delete Guide?"
        description="This will permanently delete this guide and all associated data including videos, images, and chat history. This action cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setPendingDeleteSessionId(null)}
        onConfirm={confirmDeleteSession}
      />
    </div>
  );
}
