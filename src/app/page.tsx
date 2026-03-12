'use client';

import { useRouter } from 'next/navigation';
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { toast } from 'sonner';
import {
  FiArrowRight,
  FiX,
  FiYoutube,
} from 'react-icons/fi';
import {
  LuLoader,
  LuPlus,
} from 'react-icons/lu';
import {
  DEFAULT_HANDBOOK_STYLE,
  type HandbookStyleId,
} from '@/lib/handbook-style';
import { createSessionId, toSessionTitle } from '@/lib/session-items';
import { formatSessionDate } from '@/lib/session-time';
import {
  sessionsActions,
  type SessionSummary,
  useSessionsStore,
} from '@/stores/sessions-store';
import { useAuthStore } from '@/stores/auth-store';
import { useHydrateAuthStore } from '@/stores/use-hydrate-auth-store';
import { useHydrateSessionsStore } from '@/stores/use-hydrate-sessions-store';
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog';
import { AestheticStyleSelector } from '@/components/aesthetic-style-selector';
import {
  SessionContextMenu,
  type SessionContextMenuState,
} from '@/components/session-context-menu';
import { SessionSidebar } from '@/components/session-sidebar';
import { UploadTest } from '@/components/upload-test';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'youtu.be']);
const EXAMPLE_VIDEOS = [
  { label: '48 Hours in Hiroshima and Miyajima', id: 'ZAmZgQlx_u4' },
  { label: 'How to Spend 4 Days in Osaka', id: 'hWXRiDOFFT0' },
] as const;

function normalizeYoutubeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;

  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (host === 'youtu.be') {
    const id = parsed.pathname.replace('/', '').trim();
    if (id.length < 6) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  }

  const id = parsed.searchParams.get('v')?.trim() ?? '';
  if (id.length < 6) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace('/', '').trim();
      return id.length >= 6 ? id : null;
    }
    const id = parsed.searchParams.get('v')?.trim() ?? '';
    return id.length >= 6 ? id : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const router = useRouter();
  const authSnapshot = useAuthStore(state => ({
    user: state.user,
    loading: state.loading,
    lastFetched: state.lastFetched,
  }));
  const { sessionItems, sessionsLoading } = useSessionsStore(state => ({
    sessionItems: state.sessions,
    sessionsLoading: state.loading,
  }));
  const [input, setInput] = useState('');
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<HandbookStyleId>(
    DEFAULT_HANDBOOK_STYLE,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<SessionContextMenuState | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  useHydrateAuthStore();
  useHydrateSessionsStore();
  const pendingDeleteSession = pendingDeleteSessionId
    ? (sessionItems.find(item => item.id === pendingDeleteSessionId) ?? null)
    : null;
  const isAuthHydrating = authSnapshot.loading || authSnapshot.lastFetched === null;
  const isGuestUser = authSnapshot.user?.isGuest ?? true;

  useEffect(() => {
    if (isAuthHydrating) return;
    if (!isGuestUser) return;
    router.replace('/login');
  }, [isAuthHydrating, isGuestUser, router]);

  const selectedVideoId = useMemo(() => {
    if (!selectedVideoUrl) return null;
    return extractYoutubeVideoId(selectedVideoUrl);
  }, [selectedVideoUrl]);
  const featuredSessionId = sessionItems[0]?.id ?? null;

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

  if (isAuthHydrating || isGuestUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary text-text-tertiary">
        <LuLoader className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const addVideoFromInput = () => {
    const normalized = normalizeYoutubeUrl(input);
    if (!normalized) {
      setFormError('Please paste a valid YouTube video URL.');
      return;
    }

    setSelectedVideoUrl(normalized);
    setInput('');
    setFormError(null);
  };

  const removeSelectedVideo = () => {
    setSelectedVideoUrl(null);
  };

  const selectExampleVideo = (videoId: string) => {
    setSelectedVideoUrl(`https://www.youtube.com/watch?v=${videoId}`);
    setInput('');
    setFormError(null);
  };

  const handleCreateHandbook = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isGuestUser) {
      toast.warning('Please login to create a guide.');
      return;
    }

    const normalizedFromInput = normalizeYoutubeUrl(input);
    const activeVideoUrl = selectedVideoUrl ?? normalizedFromInput;
    if (!activeVideoUrl) {
      setFormError('Add one YouTube video first.');
      return;
    }

    const createdAt = Date.now();
    const titleSeed = extractYoutubeVideoId(activeVideoUrl) ?? activeVideoUrl;

    const nextItem: SessionSummary = {
      id: createSessionId(),
      title: toSessionTitle(titleSeed),
      meta: formatSessionDate(createdAt),
      isError: false,
      status: 'idle',
      lastStep: null,
      startedAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    sessionsActions.addSession(nextItem);
    setFormError(null);
    setInput('');
    setSelectedVideoUrl(activeVideoUrl);

    router.push(
      `/session/${nextItem.id}?initial=${encodeURIComponent(activeVideoUrl)}&style=${selectedStyle}`,
    );
  };
  const openSessionContextMenu = (
    event: ReactMouseEvent<HTMLElement>,
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
    sessionsActions.removeSession(deletedSessionId);
  };

  return (
    <div className="h-screen overflow-hidden bg-bg-primary text-text-primary">
      <div className="flex h-full flex-col md:flex-row">
        <SessionSidebar
          variant="home"
          sessionItems={sessionItems}
          sessionsLoading={sessionsLoading}
          activeSessionId={featuredSessionId}
          isCollapsed={isSidebarCollapsed}
          onExpand={() => setIsSidebarCollapsed(false)}
          onCollapse={() => setIsSidebarCollapsed(true)}
          newSessionHref="/"
          newSessionAriaLabel="Create new session"
          onSessionContextMenu={openSessionContextMenu}
          renamingSessionId={renamingSessionId}
          renameDraft={renameDraft}
          renameInputRef={renameInputRef}
          onRenameDraftChange={setRenameDraft}
          onRenameSubmit={commitRenameSession}
          onRenameCancel={cancelRenameSession}
        />

        <main className="ui-page-enter-down flex flex-1 items-center justify-center overflow-y-auto px-5 py-10 md:px-6 md:py-14">
          <section className="w-full max-w-[480px] text-center">
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-[32px] font-bold tracking-[-0.64px] text-text-primary">
                Tabi
              </h1>
              <p className="max-w-[372px] text-[15px] leading-[1.6] text-text-secondary">
                Transform the transient beauty of travel content into permanent,
                premium artifacts.
              </p>
            </div>

            <form className="mt-8 flex flex-col gap-8" onSubmit={handleCreateHandbook}>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2 text-left">
                  <label
                    htmlFor="youtube-url"
                    className="text-[15px] font-semibold text-text-primary"
                  >
                    What guide do you want to create?
                  </label>

                  {selectedVideoUrl && (
                    <div className="flex h-[52px] items-center gap-3 rounded-[12px] border border-border-light bg-bg-secondary px-4">
                      <FiYoutube className="h-5 w-5 shrink-0 text-red-500" />
                      <span className="min-w-0 flex-1 truncate text-left text-[14px] leading-[1.4] text-text-primary">
                        {selectedVideoId ?? selectedVideoUrl}
                      </span>
                      <button
                        type="button"
                        onClick={removeSelectedVideo}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-text-tertiary transition hover:bg-border-light hover:text-text-secondary"
                        aria-label="Remove selected video"
                      >
                        <FiX className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <FiYoutube className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-tertiary" />
                    <input
                      id="youtube-url"
                      className="h-[52px] w-full rounded-[12px] border border-border-light bg-bg-secondary pl-12 pr-16 text-[14px] text-text-primary outline-none transition placeholder:text-text-tertiary focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                      placeholder="Paste YouTube video URL..."
                      value={input}
                      onChange={event => setInput(event.currentTarget.value)}
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        addVideoFromInput();
                      }}
                    />
                    {input.trim() && (
                      <button
                        type="button"
                        onClick={addVideoFromInput}
                        className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[6px] bg-accent-primary-bg text-accent-primary transition hover:brightness-95"
                        aria-label="Add video URL"
                      >
                        <LuPlus className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <p className="flex flex-wrap items-center gap-2 text-[12px] leading-4 text-text-tertiary">
                    <span>Try:</span>
                    {EXAMPLE_VIDEOS.map((video, index) => (
                      <span key={video.id} className="inline-flex items-center gap-2">
                        {index > 0 && <span>·</span>}
                        <button
                          type="button"
                          onClick={() => selectExampleVideo(video.id)}
                          className="font-medium text-accent-primary transition hover:opacity-80"
                        >
                          &quot;{video.label}&quot;
                        </button>
                      </span>
                    ))}
                  </p>
                </div>

                <div className="flex flex-col gap-3 text-left">
                  <h2 className="text-[15px] font-semibold text-text-primary">
                    Choose your guide&apos;s aesthetic
                  </h2>
                  <p className="text-[13px] leading-[1.4] text-text-secondary">
                    Match your channel&apos;s visual identity
                  </p>

                  <AestheticStyleSelector
                    value={selectedStyle}
                    onChange={setSelectedStyle}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-[14px] bg-gradient-to-r from-[#F97066] to-[#FB923C] px-6 text-[16px] font-semibold text-text-inverse transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create My Guide
                <FiArrowRight className="h-5 w-5" />
              </button>

              {formError && (
                <p className="text-[13px] font-medium text-status-error">{formError}</p>
              )}
            </form>

            <UploadTest />
          </section>
        </main>
      </div>

      <SessionContextMenu
        menu={contextMenu}
        menuRef={menuRef}
        onRename={startRenameSession}
        onDelete={requestDeleteSession}
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
