'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import {
  FiArrowRight,
  FiCheck,
  FiX,
  FiYoutube,
} from 'react-icons/fi';
import {
  LuClock3,
  LuFileText,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPlus,
} from 'react-icons/lu';
import {
  DEFAULT_HANDBOOK_STYLE,
  HANDBOOK_STYLE_OPTIONS,
  type HandbookStyleId,
} from '@/lib/handbook-style';
import { createSessionId, toSessionTitle } from '@/lib/session-items';
import { formatSessionDateTime } from '@/lib/session-time';
import {
  sessionsActions,
  type SessionSummary,
  useSessionsStore,
} from '@/stores/sessions-store';
import { useHydrateSessionsStore } from '@/stores/use-hydrate-sessions-store';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'youtu.be']);
const EXAMPLE_VIDEOS = [
  { label: 'Tokyo Coffee Tour', id: 'dQw4w9WgXcQ' },
  { label: 'Osaka Street Food', id: 'xvFZjo5PgG0' },
] as const;

function getStyleLabel(styleId: HandbookStyleId): string {
  if (styleId === 'minimal-tokyo') return 'Minimal\nTokyo';
  if (styleId === 'warm-analog') return 'Warm\nAnalog';
  if (styleId === 'dreamy-soft') return 'Dreamy\nSoft';
  if (styleId === 'let-tabi-decide') return 'Let Tabi\ndecide';
  return 'Brutalist';
}

function renderStylePreview(styleId: HandbookStyleId, selected: boolean) {
  const badge = selected ? (
    <span className="absolute right-[6px] top-[6px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary text-text-inverse">
      <FiCheck className="h-3 w-3" />
    </span>
  ) : null;

  if (styleId === 'minimal-tokyo') {
    return (
      <span className="relative mx-auto block h-[68px] w-[68px] rounded-[24px] border-2 border-[#E4E4E7] bg-bg-elevated">
        <span className="absolute left-[5px] top-[5px] grid h-[54px] w-[54px] grid-cols-5 gap-[6px]">
          {Array.from({ length: 25 }, (_, index) => (
            <span
              key={`dot-${index}`}
              className="h-[6px] w-[6px] rounded-full bg-[#C4C4C4]"
            />
          ))}
        </span>
        {badge}
      </span>
    );
  }

  if (styleId === 'warm-analog') {
    return (
      <span
        className="relative mx-auto block h-[68px] w-[68px] rounded-[24px] border-2 border-[#E4E4E7]"
        style={{
          background:
            'linear-gradient(145deg, rgb(254, 247, 230) 0%, rgb(245, 230, 200) 40%, rgb(232, 212, 168) 100%)',
        }}
      >
        {badge}
      </span>
    );
  }

  if (styleId === 'brutalist') {
    return (
      <span className="relative mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-[24px] border-2 border-[#E4E4E7] bg-zinc-900">
        <span className="block h-[28px] w-[28px] rounded-[6px] bg-rose-500" />
        {badge}
      </span>
    );
  }

  if (styleId === 'dreamy-soft') {
    return (
      <span
        className="relative mx-auto block h-[68px] w-[68px] rounded-[24px] border-2 border-[#E4E4E7]"
        style={{
          background:
            'linear-gradient(145deg, rgb(253, 244, 255) 0%, rgb(243, 232, 255) 40%, rgb(233, 213, 255) 100%)',
        }}
      >
        {badge}
      </span>
    );
  }

  return (
    <span
      className="relative mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-[24px] border-2 border-[#E4E4E7] bg-gradient-to-br from-[var(--tabi-bg-secondary)] via-[var(--tabi-bg-primary)] to-[var(--tabi-border-light)]"
      style={{
        ['--tabi-bg-secondary' as string]: '#F5F3EF',
        ['--tabi-bg-primary' as string]: '#FAFAF8',
        ['--tabi-border-light' as string]: '#E8E6E3',
      }}
    >
      <span className="block text-[20px] leading-none font-semibold text-[#71717A]">
        旅
      </span>
      {badge}
    </span>
  );
}

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
  const sessionItems = useSessionsStore(state => state.sessions);
  const [input, setInput] = useState('');
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<HandbookStyleId>(
    DEFAULT_HANDBOOK_STYLE,
  );
  const [formError, setFormError] = useState<string | null>(null);
  useHydrateSessionsStore();

  const selectedVideoId = useMemo(() => {
    if (!selectedVideoUrl) return null;
    return extractYoutubeVideoId(selectedVideoUrl);
  }, [selectedVideoUrl]);
  const featuredSessionId = sessionItems[0]?.id ?? null;

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
      meta: formatSessionDateTime(createdAt),
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

  return (
    <div className="h-screen overflow-hidden bg-bg-primary text-text-primary">
      <div className="flex h-full flex-col md:flex-row">
        <aside
          className={`relative w-full overflow-visible md:h-full md:shrink-0 md:transition-[width] md:duration-200 ${
            isSidebarCollapsed
              ? 'w-0 border-r-0 bg-transparent md:w-0'
              : 'w-full border-r border-border-light bg-bg-elevated md:w-[280px]'
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

                <div className="hidden items-center gap-2 md:flex">
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
                    aria-label="Create new session"
                  >
                    <LuPlus className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <nav className="max-h-72 space-y-0.5 overflow-y-auto pb-2 md:h-[calc(100vh-66px)] md:max-h-none">
                {sessionItems.map(session => {
                  const isActive = session.id === featuredSessionId;
                  return (
                    <Link
                      key={session.id}
                      href={`/session/${session.id}`}
                      title={session.title}
                      className={`flex gap-3 rounded-[8px] px-3 py-3 transition ${
                        isActive ? 'bg-accent-primary-bg' : 'hover:bg-bg-secondary'
                      }`}
                    >
                      <LuFileText
                        className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${
                          isActive ? 'text-accent-primary' : 'text-text-tertiary'
                        }`}
                      />
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
                  );
                })}
              </nav>
            </div>
          )}
        </aside>

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
                      <FiYoutube className="h-5 w-5 shrink-0 text-accent-primary" />
                      <span className="min-w-0 flex-1 truncate text-left text-[14px] leading-[1.4] text-text-primary">
                        {selectedVideoId ?? selectedVideoUrl}
                      </span>
                      <button
                        type="button"
                        onClick={removeSelectedVideo}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-text-tertiary transition hover:bg-bg-elevated hover:text-text-secondary"
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

                  <div className="flex flex-nowrap items-start justify-between gap-1">
                    {HANDBOOK_STYLE_OPTIONS.map(option => {
                      const selected = selectedStyle === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSelectedStyle(option.id)}
                          className="group relative w-[80px] p-0 text-center transition"
                        >
                          {renderStylePreview(option.id, selected)}
                          <span
                            className={`mt-2 block whitespace-pre-line text-[13px] font-medium leading-[1.25] ${
                              selected ? 'text-text-primary' : 'text-text-secondary'
                            }`}
                          >
                            {getStyleLabel(option.id)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
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
          </section>
        </main>
      </div>
    </div>
  );
}
