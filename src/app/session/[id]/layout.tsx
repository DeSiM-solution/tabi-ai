'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  LuCode,
  LuClock3,
  LuDownload,
  LuExternalLink,
  LuFileText,
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
  useSessionsStore,
  sessionsActions,
} from '@/stores/sessions-store';
import { useSessionStore } from '@/stores/session-store';
import { useHydrateSessionsStore } from '@/stores/use-hydrate-sessions-store';
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

export default function SessionDetailLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const activeSessionId = typeof params.id === 'string' ? params.id : '';
  const sessionItems = useSessionsStore(state => state.sessions);
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
  const guidePreviewPath = activeSessionId ? `/api/guide/${activeSessionId}` : null;
  const previewTarget = handbookPreviewUrl || guidePreviewPath;
  const isProcessBusy = useSessionStore(state => state.loading);
  const [contextMenu, setContextMenu] = useState<SessionContextMenuState | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [chatPanelWidth, setChatPanelWidth] = useState(CHAT_PANEL_DEFAULT_WIDTH);
  const [isResizingChatPanel, setIsResizingChatPanel] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const chatResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  useHydrateSessionsStore();

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

  const deleteSession = (sessionId: string) => {
    const target = sessionItems.find(item => item.id === sessionId);
    if (!target) return;

    setContextMenu(null);
    if (renamingSessionId === sessionId) {
      cancelRenameSession();
    }

    const shouldDelete = window.confirm(
      `Delete "${target.title}"? This action cannot be undone.`,
    );
    if (!shouldDelete) return;

    const nextSessionId = sessionItems.find(item => item.id !== sessionId)?.id ?? null;
    sessionsActions.removeSession(sessionId);

    if (activeSessionId === sessionId) {
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
    try {
      const target = previewTarget
        ? new URL(previewTarget, window.location.origin).toString()
        : window.location.href;
      await copyTextToClipboard(target);
      toast.success('Link copied to clipboard');
    } catch (error) {
      console.error('[session-layout] copy-share-link-failed', error);
      toast.error('Failed to copy link');
    }
  };

  const dispatchCenterToolbarAction = (action: CenterToolbarAction) => {
    if (!activeSessionId) return;
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
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] bg-bg-secondary font-japanese text-[14px] font-medium leading-none text-text-primary">
                    旅
                  </span>
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
                {sessionItems.map(session => {
                  const isActive = session.id === activeSessionId;
                  const isRenaming = renamingSessionId === session.id;
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
                                <span className="inline-flex items-center gap-1">
                                  <LuClock3 className="h-3 w-3" />
                                  {session.meta}
                                </span>
                              )}
                            </p>
                          </div>
                        </Link>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <section className="ui-page-enter-down hidden min-h-0 min-w-0 flex-1 flex-col lg:flex">
            <div className="px-5 pt-4">
              <div className="mx-auto flex h-[80px] items-center justify-center">
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
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-primary-bg text-accent-primary transition hover:brightness-95"
                        aria-label="Copy link"
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

            <div className="min-h-0 flex-1 px-6 pb-6 pt-3">
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
            onClick={() => deleteSession(contextMenu.sessionId)}
            className="flex w-full items-center gap-[10px] rounded-[6px] px-3 py-2 text-left text-[13px] font-normal text-accent-secondary transition hover:bg-bg-secondary/70"
          >
            <LuTrash2 className="h-[15px] w-[15px] shrink-0 text-accent-secondary" />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
