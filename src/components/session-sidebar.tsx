'use client';

import type { MouseEvent, RefObject } from 'react';
import Link from 'next/link';
import {
  LuArchive,
  LuClock3,
  LuFileText,
  LuGlobe,
  LuLoader,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPlus,
} from 'react-icons/lu';
import {
  getHandbookLifecycleLabel,
  type HandbookLifecycle,
} from '@/lib/handbook-lifecycle';
import type { SessionSummary } from '@/stores/sessions-store';
import { UserCenterPanel } from '@/components/user-center-panel';

type SessionSidebarVariant = 'home' | 'detail';

interface SessionSidebarProps {
  variant: SessionSidebarVariant;
  sessionItems: SessionSummary[];
  sessionsLoading: boolean;
  activeSessionId: string | null;
  isCollapsed: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  newSessionHref: string;
  newSessionAriaLabel: string;
  onSessionContextMenu?: (
    event: MouseEvent<HTMLElement>,
    sessionId: string,
  ) => void;
  renamingSessionId?: string | null;
  renameDraft?: string;
  renameInputRef?: RefObject<HTMLInputElement | null>;
  onRenameDraftChange?: (value: string) => void;
  onRenameSubmit?: (sessionId: string) => void;
  onRenameCancel?: () => void;
}

function getLifecycleBadgeClassName(lifecycle: HandbookLifecycle): string {
  if (lifecycle === 'PUBLIC') {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (lifecycle === 'ARCHIVED') {
    return 'bg-zinc-100 text-zinc-600';
  }
  return 'bg-amber-50 text-amber-700';
}

function renderLifecycleIcon(lifecycle: HandbookLifecycle) {
  if (lifecycle === 'PUBLIC') {
    return <LuGlobe className="h-[14px] w-[14px] shrink-0 text-emerald-600" />;
  }
  if (lifecycle === 'ARCHIVED') {
    return <LuArchive className="h-[14px] w-[14px] shrink-0 text-zinc-500" />;
  }
  return <LuFileText className="h-[14px] w-[14px] shrink-0 text-amber-600" />;
}

export function SessionSidebar({
  variant,
  sessionItems,
  sessionsLoading,
  activeSessionId,
  isCollapsed,
  onExpand,
  onCollapse,
  newSessionHref,
  newSessionAriaLabel,
  onSessionContextMenu,
  renamingSessionId = null,
  renameDraft = '',
  renameInputRef,
  onRenameDraftChange,
  onRenameSubmit,
  onRenameCancel,
}: SessionSidebarProps) {
  const isDetail = variant === 'detail';
  const supportsRename =
    Boolean(onRenameDraftChange)
    && Boolean(onRenameSubmit)
    && Boolean(onRenameCancel);
  const asideClassName = isDetail
    ? `relative hidden shrink-0 overflow-visible xl:block xl:transition-[width] xl:duration-200 ${
      isCollapsed
        ? 'xl:w-0'
        : 'border-r border-border-light bg-bg-elevated xl:w-[280px]'
    }`
    : `relative w-full overflow-visible md:h-full md:shrink-0 md:transition-[width] md:duration-200 ${
      isCollapsed
        ? 'w-0 border-r-0 bg-transparent md:w-0'
        : 'w-full border-r border-border-light bg-bg-elevated md:w-[280px]'
    }`;
  const headerActionsClassName = isDetail
    ? 'flex items-center gap-2'
    : 'hidden items-center gap-2 md:flex';
  const navClassName = isDetail
    ? 'h-[calc(100vh-66px)] space-y-0.5 overflow-y-auto pb-2'
    : 'max-h-72 space-y-0.5 overflow-y-auto pb-2 md:h-[calc(100vh-66px)] md:max-h-none';

  return (
    <aside className={asideClassName}>
      {isCollapsed ? (
        <button
          type="button"
          onClick={onExpand}
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
              <h2 className="font-sans text-[16px] font-semibold text-text-primary">Guides</h2>
            </div>

            <div className={headerActionsClassName}>
              <button
                type="button"
                onClick={onCollapse}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-text-secondary transition hover:bg-bg-secondary/70"
                aria-label="Collapse sessions sidebar"
                aria-pressed={false}
              >
                <LuPanelLeftClose className="h-4 w-4" />
              </button>
              <Link
                href={newSessionHref}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] bg-accent-primary-bg text-accent-primary transition hover:brightness-95"
                aria-label={newSessionAriaLabel}
              >
                <LuPlus className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <nav className={navClassName}>
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
                const isLoading = session.status === 'loading';
                const isRenaming = supportsRename && renamingSessionId === session.id;
                const sessionLifecycle = session.handbookLifecycle ?? 'DRAFT';
                const rowClassName = `flex gap-3 rounded-[8px] px-3 py-3 transition ${
                  isActive ? 'bg-accent-primary-bg' : 'hover:bg-bg-secondary'
                }`;
                const iconClassName = `mt-0.5 h-[18px] w-[18px] shrink-0 ${
                  isActive ? 'text-accent-primary' : 'text-text-tertiary'
                }`;

                return (
                  <div
                    key={session.id}
                    onContextMenu={
                      onSessionContextMenu
                        ? event => onSessionContextMenu(event, session.id)
                        : undefined
                    }
                  >
                    {isRenaming ? (
                      <div className={rowClassName}>
                        <LuFileText className={iconClassName} />
                        <form
                          className="min-w-0 flex-1"
                          onSubmit={event => {
                            event.preventDefault();
                            onRenameSubmit?.(session.id);
                          }}
                        >
                          <input
                            ref={renameInputRef}
                            value={renameDraft}
                            onChange={event => onRenameDraftChange?.(event.currentTarget.value)}
                            onKeyDown={event => {
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                onRenameCancel?.();
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
                              onClick={onRenameCancel}
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
                        title={session.title}
                        className={rowClassName}
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
                                  className={`inline-flex h-5 items-center rounded-md px-2 text-[10px] uppercase ${getLifecycleBadgeClassName(
                                    sessionLifecycle,
                                  )}`}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    {renderLifecycleIcon(sessionLifecycle)}
                                    <span>{getHandbookLifecycleLabel(sessionLifecycle)}</span>
                                  </span>
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
  );
}
