'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  LuChevronDown,
  LuCheck,
  LuCode,
  LuClock3,
  LuDownload,
  LuExternalLink,
  LuFileText,
  LuLoader,
  LuMonitor,
  LuPencil,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPlus,
  LuRefreshCw,
  LuSave,
  LuShare,
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
import { useAuthStore } from '@/stores/auth-store';
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog';
import { useSessionStore } from '@/stores/session-store';
import { useHydrateSessionsStore } from '@/stores/use-hydrate-sessions-store';
import { UserCenterPanel } from '@/components/user-center-panel';
import {
  sessionEditorActions,
  useSessionEditorSnapshot,
} from './_stores/session-editor-store';
import {
  CENTER_TOOLBAR_ACTION_EVENT,
  type CenterToolbarAction,
  type CenterToolbarActionDetail,
} from './_lib/center-toolbar-actions';

interface SessionContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

const CHAT_PANEL_MIN_WIDTH = 300;
const CHAT_PANEL_MAX_WIDTH = 600;
const CHAT_PANEL_DEFAULT_WIDTH = 430;
const HANDBOOK_LIFECYCLE_OPTIONS: HandbookLifecycle[] = [
  'DRAFT',
  'PUBLIC',
  'ARCHIVED',
];

function getLifecycleBadgeClassName(lifecycle: HandbookLifecycle): string {
  if (lifecycle === 'PUBLIC') {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (lifecycle === 'ARCHIVED') {
    return 'bg-zinc-100 text-zinc-600';
  }
  return 'bg-amber-50 text-amber-700';
}

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
  const activeSessionSummary = sessionItems.find(item => item.id === activeSessionId) ?? null;
  const {
    centerViewMode,
    editorSession,
    handbookHtml,
    handbookPreviewUrl,
    previewDevice,
  } =
    useSessionEditorSnapshot(activeSessionId);
  const hasBlocks = Boolean(editorSession);
  const hasHtml = Boolean(handbookHtml || handbookPreviewUrl);
  const handbookLifecycle = activeSessionSummary?.handbookLifecycle ?? 'DRAFT';
  const isHandbookPublic = handbookLifecycle === 'PUBLIC';
  const guidePreviewPath = activeSessionId ? `/api/guide/${activeSessionId}` : null;
  const publicGuidePath = activeSessionId ? `/api/public/guide/${activeSessionId}` : null;
  const previewTarget = handbookPreviewUrl || guidePreviewPath;
  const isProcessBusy = useSessionStore(state => state.loading);
  const isGuestUser = useAuthStore(state => state.user?.isGuest ?? true);
  const [contextMenu, setContextMenu] = useState<SessionContextMenuState | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(
    null,
  );
  const [renameDraft, setRenameDraft] = useState('');
  const [chatPanelWidth, setChatPanelWidth] = useState(CHAT_PANEL_DEFAULT_WIDTH);
  const [isResizingChatPanel, setIsResizingChatPanel] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUpdatingLifecycle, setIsUpdatingLifecycle] = useState(false);
  const [isLifecycleMenuOpen, setIsLifecycleMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lifecycleMenuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const chatResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  useHydrateSessionsStore();
  const pendingDeleteSession = pendingDeleteSessionId
    ? (sessionItems.find(item => item.id === pendingDeleteSessionId) ?? null)
    : null;

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
    if (!isLifecycleMenuOpen) return;

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && lifecycleMenuRef.current?.contains(target)) return;
      setIsLifecycleMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsLifecycleMenuOpen(false);
    };

    const closeOnBlur = () => setIsLifecycleMenuOpen(false);

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('blur', closeOnBlur);

    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('blur', closeOnBlur);
    };
  }, [isLifecycleMenuOpen]);

  useEffect(() => {
    if (centerViewMode === 'html') return;
    setIsLifecycleMenuOpen(false);
  }, [centerViewMode]);

  const openSessionContextMenu = (
    event: React.MouseEvent<HTMLElement>,
    sessionId: string,
  ) => {
    event.preventDefault();

    const menuWidth = 180;
    const menuHeight = 108;
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

    sessionEditorActions.setHandbookPreviewUrl(activeSessionId, `${base}?v=${Date.now()}`);
    sessionEditorActions.setCenterViewMode(activeSessionId, 'html');
  };

  const openPreviewInNewTab = () => {
    if (!previewTarget) return;
    window.open(previewTarget, '_blank', 'noopener,noreferrer');
  };

  const copyTextToClipboard = async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) {
      throw new Error('Clipboard copy failed');
    }
  };

  const copyShareLink = async () => {
    if (!isHandbookPublic || !publicGuidePath) {
      toast.error('Publish this handbook before sharing.');
      return;
    }
    try {
      const target = new URL(publicGuidePath, window.location.origin).toString();
      await copyTextToClipboard(target);
      toast.success('Public link copied to clipboard');
    } catch (error) {
      console.error('[session-layout] copy-share-link-failed', error);
      toast.error('Failed to copy link');
    }
  };

  const updateHandbookLifecycle = async (nextLifecycle: HandbookLifecycle) => {
    if (!activeSessionId || isUpdatingLifecycle) return;
    const previousLifecycle = handbookLifecycle;
    if (nextLifecycle === previousLifecycle) return;

    if (nextLifecycle === 'PUBLIC' && !hasHtml) {
      toast.error('Generate handbook HTML before publishing.');
      return;
    }

    sessionsActions.updateSession(activeSessionId, {
      handbookLifecycle: nextLifecycle,
    });
    setIsUpdatingLifecycle(true);
    setIsLifecycleMenuOpen(false);
    try {
      const response = await fetch(`/api/sessions/${activeSessionId}/handbook-lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle: nextLifecycle }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || `Failed to update lifecycle (${response.status})`);
      }
      await sessionsActions.hydrateFromServer();
      toast.success(`Handbook moved to ${getHandbookLifecycleLabel(nextLifecycle)}.`);
    } catch (error) {
      sessionsActions.updateSession(activeSessionId, {
        handbookLifecycle: previousLifecycle,
      });
      console.error('[session-layout] update-handbook-lifecycle-failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update handbook lifecycle.');
    } finally {
      setIsUpdatingLifecycle(false);
    }
  };

  const dispatchCenterToolbarAction = (action: CenterToolbarAction) => {
    if (!activeSessionId) return;
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
        <aside
          className={`relative hidden shrink-0 overflow-visible xl:block xl:transition-[width] xl:duration-200 ${
            isSidebarCollapsed
              ? 'xl:w-0'
              : 'border-r border-border-light bg-bg-elevated xl:w-[280px]'
          }`}
        >
          {isSidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="absolute left-4 top-4 z-20 flex h-7 w-7 items-center justify-center rounded-[6px] border border-border-light bg-bg-elevated text-text-secondary shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition hover:text-text-primary"
              aria-label="Expand sessions sidebar"
              aria-pressed={true}
            >
              <LuPanelLeftOpen className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex h-full flex-col gap-0.5 px-2">
              <div className="flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-2">
                  <UserCenterPanel />
                  <h2 className="font-sans text-[16px] font-semibold text-text-primary">
                    Guides
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed(true)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-text-secondary transition hover:bg-bg-secondary/70"
                    aria-label="Collapse sessions sidebar"
                    aria-pressed={false}
                  >
                    <LuPanelLeftClose className="h-4 w-4" />
                  </button>
                  <Link
                    href="/"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] bg-accent-primary-bg text-accent-primary transition hover:brightness-95"
                    aria-label="Back to home"
                  >
                    <LuPlus className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <nav className="h-[calc(100vh-66px)] space-y-0.5 overflow-y-auto pb-2">
                {sessionsLoading && sessionItems.length === 0 ? (
                  <div className="space-y-2 px-1 py-2">
                    {Array.from({ length: 3 }, (_, index) => (
                      <div
                        key={`session-loading-${index}`}
                        className="flex animate-pulse gap-3 rounded-[8px] px-3 py-3"
                      >
                        <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded bg-border-light/70" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <span className="block h-3 w-2/3 rounded bg-border-light/70" />
                          <span className="block h-2.5 w-1/3 rounded bg-border-light/60" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  sessionItems.map(session => {
                    const isActive = session.id === activeSessionId;
                    const isRenaming = renamingSessionId === session.id;
                    const isLoading = session.status === 'loading';
                    const rowClassName = `flex gap-3 rounded-[8px] px-3 py-3 transition ${
                      isActive ? 'bg-accent-primary-bg' : 'hover:bg-bg-secondary'
                    }`;
                    const iconClassName = `mt-0.5 h-[18px] w-[18px] shrink-0 ${
                      isActive ? 'text-accent-primary' : 'text-text-tertiary'
                    }`;

                    return (
                      <div
                        key={session.id}
                        onContextMenu={event => openSessionContextMenu(event, session.id)}
                      >
                        {isRenaming ? (
                          <div className={rowClassName}>
                            <LuFileText className={iconClassName} />
                            <form
                              className="min-w-0 flex-1"
                              onSubmit={event => {
                                event.preventDefault();
                                commitRenameSession(session.id);
                              }}
                            >
                              <input
                                ref={renameInputRef}
                                value={renameDraft}
                                onChange={event => setRenameDraft(event.currentTarget.value)}
                                onKeyDown={event => {
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancelRenameSession();
                                  }
                                }}
                                className="w-full rounded-md border border-border-default bg-bg-elevated px-2 py-1 text-[13px] font-medium text-text-primary outline-none focus:border-accent-primary"
                                placeholder="Session name"
                              />
                              <div className="mt-1 flex items-center gap-1.5">
                                <button
                                  type="submit"
                                  className="rounded-md bg-accent-primary-bg px-2 py-0.5 text-[11px] font-medium text-accent-primary transition hover:brightness-95"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelRenameSession}
                                  className="rounded-md px-2 py-0.5 text-[11px] font-medium text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </div>
                        ) : (
                          <Link
                            href={`/session/${session.id}`}
                            className={rowClassName}
                            title={session.title}
                          >
                            <LuFileText className={iconClassName} />
                            <div className="min-w-0">
                              <p
                                className={`truncate text-[13px] font-medium leading-4 ${
                                  isActive ? 'text-text-primary' : 'text-text-secondary'
                                }`}
                              >
                                {session.title}
                              </p>
                              <p
                                className={`mt-1 text-[11px] leading-4 ${
                                  session.isError ? 'text-status-error' : 'text-text-tertiary'
                                }`}
                              >
                                {session.isError ? (
                                  'Error'
                                ) : (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1">
                                      {isLoading ? (
                                        <LuLoader className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <LuClock3 className="h-3 w-3" />
                                      )}
                                      {session.meta}
                                    </span>
                                    <span
                                      className={`inline-flex h-5 items-center rounded-[999px] px-2 text-[10px] font-semibold uppercase tracking-[0.04em] ${getLifecycleBadgeClassName(
                                        session.handbookLifecycle ?? 'DRAFT',
                                      )}`}
                                    >
                                      {getHandbookLifecycleLabel(
                                        session.handbookLifecycle ?? 'DRAFT',
                                      )}
                                    </span>
                                  </span>
                                )}
                              </p>
                            </div>
                          </Link>
                        )}
                      </div>
                    );
                  })
                )}
              </nav>
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <section className="ui-page-enter-down hidden min-h-0 min-w-0 flex-1 flex-col lg:flex">
            <div className="px-5 pt-2">
              <div className="mx-auto flex h-[64px] items-center justify-center">
                <div className="flex w-fit items-center gap-1.5 rounded-[14px] border border-border-light bg-bg-elevated px-1.5 py-1 shadow-[0_8px_24px_rgba(45,42,38,0.08)]">
                  <div className="flex items-center gap-0.5 rounded-[8px] bg-bg-secondary p-[3px]">
                    <button
                      type="button"
                      onClick={() =>
                        sessionEditorActions.setCenterViewMode(activeSessionId, 'blocks')
                      }
                      disabled={!hasBlocks}
                      className={`inline-flex items-center gap-[5px] rounded-[6px] px-[10px] py-[6px] text-[12px] font-medium transition-colors ${
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
                      className={`inline-flex items-center gap-[5px] rounded-[6px] px-[10px] py-[6px] text-[12px] font-medium transition-colors ${
                        centerViewMode === 'html'
                          ? 'bg-bg-elevated text-text-primary'
                          : 'bg-transparent text-text-tertiary hover:text-text-secondary'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <LuCode className="h-[14px] w-[14px]" />
                      HTML
                    </button>
                  </div>

                  {centerViewMode === 'html' ? (
                    <>
                      <div
                        ref={lifecycleMenuRef}
                        className="relative flex items-center rounded-[8px] bg-bg-secondary p-[3px]"
                      >
                        <button
                          type="button"
                          aria-label="Select handbook status"
                          aria-haspopup="menu"
                          aria-expanded={isLifecycleMenuOpen}
                          onClick={() => setIsLifecycleMenuOpen(previous => !previous)}
                          disabled={isUpdatingLifecycle}
                          className="inline-flex h-8 min-w-[132px] items-center justify-between gap-2 rounded-[6px] bg-bg-elevated px-[10px] text-[12px] font-medium text-text-primary transition hover:brightness-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span>{getHandbookLifecycleLabel(handbookLifecycle)}</span>
                          <LuChevronDown
                            className={`h-[14px] w-[14px] text-text-tertiary transition-transform ${
                              isLifecycleMenuOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {isLifecycleMenuOpen ? (
                          <div
                            role="menu"
                            aria-label="Handbook status options"
                            className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[176px] overflow-hidden rounded-[8px] border border-border-light bg-bg-elevated p-1 shadow-[0_8px_24px_rgba(45,42,38,0.12)]"
                          >
                            {HANDBOOK_LIFECYCLE_OPTIONS.map(lifecycle => {
                              const isSelected = lifecycle === handbookLifecycle;
                              const publishBlocked = lifecycle === 'PUBLIC' && !hasHtml;
                              return (
                                <button
                                  key={lifecycle}
                                  type="button"
                                  role="menuitemradio"
                                  aria-checked={isSelected}
                                  onClick={() => {
                                    if (publishBlocked || isSelected) {
                                      setIsLifecycleMenuOpen(false);
                                      return;
                                    }
                                    void updateHandbookLifecycle(lifecycle);
                                  }}
                                  disabled={publishBlocked || isUpdatingLifecycle}
                                  className="flex w-full items-center justify-between rounded-[6px] px-2.5 py-2 text-left text-[12px] font-medium text-text-primary transition hover:bg-bg-secondary disabled:cursor-not-allowed disabled:text-text-tertiary disabled:opacity-60"
                                >
                                  <span>{getHandbookLifecycleLabel(lifecycle)}</span>
                                  {isSelected ? <LuCheck className="h-[13px] w-[13px]" /> : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-0.5 rounded-[8px] bg-bg-secondary p-[3px]">
                        <button
                          type="button"
                          onClick={() =>
                            sessionEditorActions.setPreviewDevice(activeSessionId, 'desktop')
                          }
                          aria-pressed={previewDevice === 'desktop'}
                          className={`inline-flex items-center gap-[5px] rounded-[6px] px-[10px] py-[6px] text-[12px] font-medium transition-colors ${
                            previewDevice === 'desktop'
                              ? 'bg-bg-elevated text-text-primary'
                              : 'bg-transparent text-text-tertiary hover:text-text-secondary'
                          }`}
                        >
                          <LuMonitor className="h-[14px] w-[14px]" />
                          Desktop
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            sessionEditorActions.setPreviewDevice(activeSessionId, 'mobile')
                          }
                          aria-pressed={previewDevice === 'mobile'}
                          className={`inline-flex items-center gap-[5px] rounded-[6px] px-[10px] py-[6px] text-[12px] font-medium transition-colors ${
                            previewDevice === 'mobile'
                              ? 'bg-bg-elevated text-text-primary'
                              : 'bg-transparent text-text-tertiary hover:text-text-secondary'
                          }`}
                        >
                          <LuSmartphone className="h-[14px] w-[14px]" />
                          Mobile
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={refreshPreview}
                        disabled={!hasHtml}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Refresh"
                      >
                        <LuRefreshCw className="h-[18px] w-[18px]" />
                      </button>
                      <button
                        type="button"
                        onClick={openPreviewInNewTab}
                        disabled={!hasHtml}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Open in new tab"
                      >
                        <LuExternalLink className="h-[18px] w-[18px]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyShareLink()}
                        disabled={!isHandbookPublic}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-primary-bg text-accent-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-border-default disabled:text-text-tertiary"
                        aria-label="Copy public link"
                      >
                        <LuShare className="h-[18px] w-[18px]" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => dispatchCenterToolbarAction('export')}
                        disabled={!hasBlocks}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Export blocks"
                      >
                        <LuDownload className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatchCenterToolbarAction('save')}
                        disabled={!hasBlocks}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-primary-bg text-accent-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Save blocks"
                      >
                        <LuSave className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatchCenterToolbarAction('generate')}
                        disabled={!hasBlocks || isProcessBusy}
                        className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-accent-primary px-3.5 text-[13px] font-medium text-text-inverse transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-border-default disabled:text-text-tertiary"
                      >
                        <LuSparkles className="h-4 w-4" />
                        Generate
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
            className="h-screen w-full shrink-0 overflow-hidden bg-bg-elevated lg:min-w-[300px] lg:max-w-[600px] lg:w-[var(--chat-panel-width)]"
            style={{
              ['--chat-panel-width' as string]: `${chatPanelWidth}px`,
            }}
          >
            {children}
          </aside>
        </div>
      </div>

      {contextMenu ? (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-[180px] overflow-hidden rounded-[8px] bg-bg-elevated p-1 shadow-[0_4px_12px_rgba(0,0,0,0.09)]"
        >
          <button
            type="button"
            onClick={() => startRenameSession(contextMenu.sessionId)}
            className="flex w-full items-center gap-[10px] rounded-[6px] px-3 py-2 text-left text-[13px] font-normal text-text-primary transition hover:bg-bg-secondary/70"
          >
            <LuPencil className="h-[15px] w-[15px] shrink-0 text-text-secondary" />
            Rename
          </button>
          <div className="mx-1 my-1 h-px bg-border-light" />
          <button
            type="button"
            onClick={() => requestDeleteSession(contextMenu.sessionId)}
            className="flex w-full items-center gap-[10px] rounded-[6px] px-3 py-2 text-left text-[13px] font-normal text-accent-secondary transition hover:bg-bg-secondary/70"
          >
            <LuTrash2 className="h-[15px] w-[15px] shrink-0 text-accent-secondary" />
            Delete
          </button>
        </div>
      ) : null}
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
