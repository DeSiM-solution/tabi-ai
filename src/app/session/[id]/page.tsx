'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuArrowRight, LuCheck, LuLoader, LuSendHorizontal } from 'react-icons/lu';
import { BlockEditorWorkspace } from './_components/block-editor-workspace';
import { MessageContent } from './_components/message-content';
import {
  sessionEditorActions,
  useSessionEditorSnapshot,
} from './_stores/session-editor-store';
import {
  applyEditorSession,
  buildGoogleMapsCsv,
  canEditBlocks,
  createEditorSession,
  isRecord,
  isToolPart,
  toFileSlug,
  toGuidePrompt,
  type EditorSession,
  type UnknownRecord,
} from './_lib/chat-utils';
import {
  CENTER_TOOLBAR_ACTION_EVENT,
  type CenterToolbarActionDetail,
} from './_lib/center-toolbar-actions';
import {
  formatToolLabel,
  sessionActions,
  SESSION_TOOL_ORDER,
  useSessionStore,
} from '@/stores/session-store';
import { sessionsActions, useSessionsStore } from '@/stores/sessions-store';
import { formatSessionDateTime } from '@/lib/session-time';
import {
  HANDBOOK_STYLE_OPTIONS,
  getHandbookStyleInstruction,
  getHandbookStyleLabel,
  normalizeHandbookStyle,
  type HandbookStyleId,
} from '@/lib/handbook-style';

const PERSISTABLE_BLOCK_TOOL_NAMES = new Set([
  'build_travel_blocks',
  'resolve_spot_coordinates',
]);
function toStyleSelection(value: HandbookStyleId | null | undefined): HandbookStyleId {
  return value ?? 'minimal-tokyo';
}

function getStyleSelectionLabel(styleId: HandbookStyleId): string {
  if (styleId === 'minimal-tokyo') return 'Minimal\nTokyo';
  if (styleId === 'warm-analog') return 'Warm\nAnalog';
  if (styleId === 'brutalist') return 'Brutalist';
  if (styleId === 'dreamy-soft') return 'Dreamy\nSoft';
  return 'Let Tabi\ndecide';
}

function renderStyleSelectionPreview(
  preset: HandbookStyleId,
  selected: boolean,
) {
  const badge = selected ? (
    <span className="absolute right-[6px] top-[6px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-primary text-text-inverse">
      <LuCheck className="h-3 w-3" />
    </span>
  ) : null;

  if (preset === 'minimal-tokyo') {
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

  if (preset === 'brutalist') {
    return (
      <span className="relative mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-[24px] border-2 border-[#E4E4E7] bg-zinc-900">
        <span className="block h-[28px] w-[28px] rounded-[6px] bg-rose-500" />
        {badge}
      </span>
    );
  }

  if (preset === 'dreamy-soft') {
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

  if (preset === 'let-tabi-decide') {
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

type SessionHydrationPayload = {
  session?: {
    messages?: UIMessage[];
    state?: {
      context?: unknown;
      blocks?: unknown;
      spotBlocks?: unknown;
      toolOutputs?: unknown;
      handbookHtml?: string | null;
      previewPath?: string | null;
    } | null;
  };
};

const sessionDetailHydrationInFlight = new Map<
  string,
  Promise<SessionHydrationPayload | null>
>();

async function fetchSessionHydrationPayload(
  sessionId: string,
): Promise<SessionHydrationPayload | null> {
  const pending = sessionDetailHydrationInFlight.get(sessionId);
  if (pending) return pending;

  const request = (async () => {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as SessionHydrationPayload;
  })();

  const wrapped = request.finally(() => {
    sessionDetailHydrationInFlight.delete(sessionId);
  });
  sessionDetailHydrationInFlight.set(sessionId, wrapped);
  return wrapped;
}

function toGuidePreviewPath(path: string, sessionId: string): string {
  const normalized = path.split('?')[0] ?? path;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const url = new URL(normalized);
      if (url.pathname.startsWith('/api/handbook/')) {
        return `/api/guide/${sessionId}`;
      }
      return url.pathname || `/api/guide/${sessionId}`;
    } catch {
      return `/api/guide/${sessionId}`;
    }
  }
  if (normalized.startsWith('/api/handbook/')) {
    return `/api/guide/${sessionId}`;
  }
  return normalized;
}

function toPreviewAddress(previewUrl: string | null, fallbackPath: string): string {
  if (!previewUrl) return fallbackPath;
  const normalized = previewUrl.split('?')[0] ?? previewUrl;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      return new URL(normalized).pathname || fallbackPath;
    } catch {
      return fallbackPath;
    }
  }
  return normalized || fallbackPath;
}

function toPersistedBlocksOutput(
  state: {
    context?: unknown;
    blocks?: unknown;
    spotBlocks?: unknown;
    toolOutputs?: unknown;
  } | null | undefined,
): { sourceKey: string; toolName: string; output: UnknownRecord } | null {
  if (!state) return null;
  const persistedToolOutputs = isRecord(state.toolOutputs)
    ? (state.toolOutputs as Record<string, unknown>)
    : null;
  const contextRoot = isRecord(state.context) ? state.context : {};
  const contextVideo = isRecord(contextRoot.video) ? contextRoot.video : contextRoot;
  const withContextVideoMeta = (output: UnknownRecord): UnknownRecord => ({
    ...output,
    title:
      typeof output.title === 'string'
        ? output.title
        : typeof contextVideo.title === 'string'
          ? contextVideo.title
          : '',
    videoId:
      typeof output.videoId === 'string'
        ? output.videoId
        : typeof contextVideo.videoId === 'string'
          ? contextVideo.videoId
          : '',
    videoUrl:
      typeof output.videoUrl === 'string'
        ? output.videoUrl
        : typeof contextVideo.videoUrl === 'string'
          ? contextVideo.videoUrl
          : '',
    thumbnailUrl:
      typeof output.thumbnailUrl === 'string'
        ? output.thumbnailUrl
        : typeof contextVideo.thumbnailUrl === 'string'
          ? contextVideo.thumbnailUrl
          : '',
  });

  const preferredResolveOutput = persistedToolOutputs?.resolve_spot_coordinates;
  if (isRecord(preferredResolveOutput) && Array.isArray(preferredResolveOutput.blocks)) {
    return {
      sourceKey: 'persisted:resolve_spot_coordinates',
      toolName: 'resolve_spot_coordinates',
      output: withContextVideoMeta(preferredResolveOutput),
    };
  }

  const preferredBuildOutput = persistedToolOutputs?.build_travel_blocks;
  if (isRecord(preferredBuildOutput) && Array.isArray(preferredBuildOutput.blocks)) {
    return {
      sourceKey: 'persisted:build_travel_blocks',
      toolName: 'build_travel_blocks',
      output: withContextVideoMeta(preferredBuildOutput),
    };
  }

  if (!Array.isArray(state.blocks)) return null;

  const fallbackSpotBlocks = Array.isArray(state.spotBlocks)
    ? state.spotBlocks
    : state.blocks.filter(
        block => isRecord(block) && typeof block.type === 'string' && block.type === 'spot',
      );

  return {
    sourceKey: 'persisted:resolve_spot_coordinates',
    toolName: 'resolve_spot_coordinates',
    output: {
      title: typeof contextVideo.title === 'string' ? contextVideo.title : '',
      videoId: typeof contextVideo.videoId === 'string' ? contextVideo.videoId : '',
      videoUrl: typeof contextVideo.videoUrl === 'string' ? contextVideo.videoUrl : '',
      thumbnailUrl:
        typeof contextVideo.thumbnailUrl === 'string' ? contextVideo.thumbnailUrl : '',
      blockCount: state.blocks.length,
      spotCount: fallbackSpotBlocks.length,
      blocks: state.blocks,
      spot_blocks: fallbackSpotBlocks,
    },
  };
}

function getPersistedHandbookStyle(context: unknown): HandbookStyleId | null {
  if (!isRecord(context)) return null;
  const rootStyle = normalizeHandbookStyle(context.handbookStyle);
  if (rootStyle) return rootStyle;

  const nestedVideo = isRecord(context.video) ? context.video : null;
  const nestedStyle = normalizeHandbookStyle(nestedVideo?.handbookStyle);
  return nestedStyle;
}

function countGenerateHandbookOutputs(messages: UIMessage[]): number {
  let count = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolPart(part)) continue;
      if (part.type !== 'tool-generate_handbook_html') continue;
      if (part.state !== 'output-available') continue;
      count += 1;
    }
  }
  return count;
}

function MainContentLoadingState({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg-primary px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-text-primary">
          <span className="font-japanese text-[34px] font-semibold leading-none text-text-inverse">
            旅
          </span>
        </div>
        <div className="relative h-6 w-6">
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent-primary border-r-accent-primary" />
        </div>
        <p className="text-[16px] font-medium text-text-secondary">{label}</p>
      </div>
    </div>
  );
}

export default function Chat() {
  const params = useParams<{ id: string }>();
  const sessionId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialInput = searchParams.get('initial') ?? '';
  const initialStyle = searchParams.get('style');
  const currentSessionSummary = useSessionsStore(state =>
    state.sessions.find(session => session.id === sessionId) ?? null,
  );
  const processState = useSessionStore(state => ({
    sessionId: state.sessionId,
    loading: state.loading,
    error: state.error,
    stopped: state.stopped,
    currentStep: state.currentStep,
    failedStep: state.failedStep,
    completedSteps: state.completedSteps,
  }));
  const editorState = useSessionEditorSnapshot(sessionId);
  const {
    editedToolOutputs,
    editorSession,
    handbookHtml,
    handbookPreviewUrl,
    handbookStatus,
    handbookError,
    centerViewMode,
    previewDevice,
  } = editorState;

  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [isSessionHydrating, setIsSessionHydrating] = useState(false);
  const [handbookStyle, setHandbookStyle] = useState<HandbookStyleId | null>(
    () => normalizeHandbookStyle(initialStyle),
  );
  const [isStyleConfirmOpen, setIsStyleConfirmOpen] = useState(false);
  const [pendingStyleSession, setPendingStyleSession] =
    useState<EditorSession | null>(null);
  const [selectedStyleOption, setSelectedStyleOption] =
    useState<HandbookStyleId>('minimal-tokyo');
  const [setAsSessionDefault, setSetAsSessionDefault] = useState(true);

  const didSendInitialInputRef = useRef(false);
  const loggedToolEventsRef = useRef<Set<string>>(new Set());
  const autoOpenedEditableSourceRef = useRef<Set<string>>(new Set());
  const pendingToolbarGenerationRef = useRef<{ beforeCount: number } | null>(null);
  const hydratedSessionRef = useRef<string | null>(null);
  const hydratingSessionRef = useRef<string | null>(null);
  const activeHydrationSessionRef = useRef<string | null>(null);
  const persistedHandbookStyleRef = useRef<string>('');
  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { sessionId },
      }),
    [sessionId],
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: sessionId || undefined,
    transport: chatTransport,
  });
  const isBusy = status === 'submitted' || status === 'streaming';
  const guidePreviewPath = sessionId ? `/api/guide/${sessionId}` : '/api/guide';
  const previewAddress = useMemo(
    () => toPreviewAddress(handbookPreviewUrl, guidePreviewPath),
    [guidePreviewPath, handbookPreviewUrl],
  );
  const previewFrameWidth = previewDevice === 'mobile' ? 375 : 720;
  const previewFrameMaxHeight = 'calc(100vh - 128px)';
  const firstUserTextMessage = useMemo(() => {
    for (const message of messages) {
      if (message.role !== 'user') continue;
      const text = message.parts
        .flatMap(part => {
          if (part.type !== 'text') return [];
          const trimmed = part.text.trim();
          return trimmed ? [trimmed] : [];
        })
        .join('\n');
      if (text) {
        return {
          id: message.id,
          text,
        };
      }
    }
    return null;
  }, [messages]);

  const patchSessionState = useCallback(async (patch: Record<string, unknown>) => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/sessions/${sessionId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        throw new Error(`Failed to patch session state (${response.status})`);
      }
    } catch (error) {
      console.error('[chat-ui] patch-session-state-failed', {
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [sessionId]);

  const persistEditorOutput = useCallback((session: EditorSession, output: UnknownRecord) => {
    const blocks = Array.isArray(output.blocks) ? output.blocks : undefined;
    const spotBlocks = Array.isArray(output.spot_blocks) ? output.spot_blocks : undefined;
    const toolOutputs = PERSISTABLE_BLOCK_TOOL_NAMES.has(session.toolName)
      ? { [session.toolName]: output }
      : undefined;

    if (!blocks && !spotBlocks && !toolOutputs) return;

    void patchSessionState({
      blocks,
      spotBlocks,
      toolOutputs,
    });
  }, [patchSessionState]);

  useEffect(() => {
    if (!sessionId) {
      setIsSessionHydrating(false);
      return;
    }
    hydratedSessionRef.current = null;
    hydratingSessionRef.current = null;
    activeHydrationSessionRef.current = null;
    autoOpenedEditableSourceRef.current = new Set();
    persistedHandbookStyleRef.current = '';
    setIsSessionHydrating(true);
    setHandbookStyle(null);
    setMessages([]);
    sessionActions.setSessionId(sessionId);
    sessionEditorActions.ensureSession(sessionId);
  }, [sessionId, setMessages]);

  useEffect(() => {
    const styleFromQuery = normalizeHandbookStyle(initialStyle);
    if (!styleFromQuery) return;
    setHandbookStyle(styleFromQuery);
  }, [initialStyle, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    sessionActions.syncFromMessages(sessionId, messages, editedToolOutputs, isBusy);
  }, [editedToolOutputs, isBusy, messages, sessionId]);

  useEffect(() => {
    if (!sessionId || !handbookStyle) return;
    const styleKey = `${sessionId}:${handbookStyle}`;
    if (persistedHandbookStyleRef.current === styleKey) return;

    persistedHandbookStyleRef.current = styleKey;
    void patchSessionState({
      context: {
        handbookStyle,
      },
    });
  }, [handbookStyle, patchSessionState, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setIsSessionHydrating(false);
      return;
    }
    if (hydratedSessionRef.current === sessionId) {
      setIsSessionHydrating(false);
      return;
    }
    if (hydratingSessionRef.current === sessionId) {
      activeHydrationSessionRef.current = sessionId;
      return;
    }

    activeHydrationSessionRef.current = sessionId;
    hydratingSessionRef.current = sessionId;
    setIsSessionHydrating(true);

    const hydrateSession = async () => {
      try {
        const payload = await fetchSessionHydrationPayload(sessionId);
        if (activeHydrationSessionRef.current !== sessionId) return;

        if (!payload?.session) {
          hydratedSessionRef.current = null;
          return;
        }
        if (activeHydrationSessionRef.current !== sessionId) return;

        hydratedSessionRef.current = sessionId;
        if (Array.isArray(payload.session?.messages) && payload.session.messages.length > 0) {
          setMessages(payload.session.messages);
        }

        const handbookHtmlFromDb =
          typeof payload.session?.state?.handbookHtml === 'string'
            ? payload.session.state.handbookHtml
            : null;
        const previewPath =
          typeof payload.session?.state?.previewPath === 'string'
            ? payload.session.state.previewPath
            : null;
        const persistedHandbookStyle = getPersistedHandbookStyle(
          payload.session?.state?.context,
        );

        if (persistedHandbookStyle) {
          persistedHandbookStyleRef.current = `${sessionId}:${persistedHandbookStyle}`;
          setHandbookStyle(persistedHandbookStyle);
        }

        if (handbookHtmlFromDb) {
          sessionEditorActions.setHandbookHtml(sessionId, handbookHtmlFromDb);
          sessionEditorActions.setHandbookStatus(sessionId, 'ready');
          sessionEditorActions.setHandbookError(sessionId, null);
          sessionEditorActions.setCenterViewMode(sessionId, 'html');
        }
        if (previewPath) {
          const normalizedPreviewPath = toGuidePreviewPath(previewPath, sessionId);
          sessionEditorActions.setHandbookPreviewUrl(
            sessionId,
            `${normalizedPreviewPath}?v=latest`,
          );
        } else if (handbookHtmlFromDb) {
          sessionEditorActions.setHandbookPreviewUrl(
            sessionId,
            `/api/guide/${sessionId}?v=latest`,
          );
        }

        const persistedEditable = toPersistedBlocksOutput(payload.session?.state);
        if (persistedEditable) {
          sessionEditorActions.upsertEditedToolOutput(
            sessionId,
            persistedEditable.sourceKey,
            persistedEditable.output,
          );
          const restoredEditorSession = createEditorSession(
            persistedEditable.sourceKey,
            persistedEditable.toolName,
            persistedEditable.output,
          );
          if (restoredEditorSession) {
            sessionEditorActions.setEditorSession(sessionId, restoredEditorSession);
            if (!handbookHtmlFromDb && !previewPath) {
              sessionEditorActions.setCenterViewMode(sessionId, 'blocks');
            }
          }
        }
      } catch (error) {
        if (activeHydrationSessionRef.current === sessionId) {
          hydratedSessionRef.current = null;
        }
        console.error('[chat-ui] hydrate-session-failed', { sessionId, error });
      } finally {
        if (hydratingSessionRef.current === sessionId) {
          hydratingSessionRef.current = null;
        }
        if (activeHydrationSessionRef.current === sessionId) {
          setIsSessionHydrating(false);
        }
      }
    };

    void hydrateSession();

    return () => {
      if (activeHydrationSessionRef.current === sessionId) {
        activeHydrationSessionRef.current = null;
      }
    };
  }, [sessionId, setMessages]);

  useEffect(() => {
    if (didSendInitialInputRef.current) return;
    if (!initialInput.trim()) return;

    const prompt = toGuidePrompt(initialInput);
    if (!prompt) return;

    const dedupeKey = `${pathname}::${prompt}`;
    if (typeof window !== 'undefined') {
      if (window.sessionStorage.getItem(dedupeKey) === 'sent') {
        didSendInitialInputRef.current = true;
        router.replace(pathname);
        return;
      }
      window.sessionStorage.setItem(dedupeKey, 'sent');
    }

    didSendInitialInputRef.current = true;
    sendMessage({ text: prompt });
    router.replace(pathname);
  }, [initialInput, pathname, router, sendMessage]);

  useEffect(() => {
    if (!sessionId) return;
    if (processState.sessionId !== sessionId) return;
    if (isSessionHydrating) return;

    if (processState.stopped) {
      sessionsActions.updateSession(sessionId, {
        meta: 'Stopped',
        isError: false,
        status: 'cancelled',
        lastStep: processState.currentStep,
      });
      return;
    }

    if (processState.error || processState.failedStep) {
      sessionsActions.updateSession(sessionId, {
        meta: 'Error',
        isError: true,
        status: 'error',
        lastStep: processState.failedStep,
      });
      return;
    }

    if (processState.loading) {
      const startedAt = currentSessionSummary?.startedAt ?? Date.now();
      sessionsActions.updateSession(sessionId, {
        meta: `Running · ${formatToolLabel(processState.currentStep)}`,
        isError: false,
        status: 'loading',
        lastStep: processState.currentStep,
        startedAt,
        createdAt: currentSessionSummary?.createdAt ?? startedAt,
      });
      return;
    }

    if (processState.completedSteps.length > 0) {
      const startedAt =
        currentSessionSummary?.startedAt ?? currentSessionSummary?.createdAt ?? Date.now();
      sessionsActions.updateSession(sessionId, {
        meta: formatSessionDateTime(startedAt),
        isError: false,
        status: 'completed',
        lastStep: processState.currentStep,
        startedAt,
        createdAt: currentSessionSummary?.createdAt ?? startedAt,
      });
    }
  }, [
    currentSessionSummary?.createdAt,
    currentSessionSummary?.startedAt,
    processState.completedSteps.length,
    processState.currentStep,
    processState.error,
    processState.failedStep,
    processState.loading,
    processState.sessionId,
    processState.stopped,
    sessionId,
    isSessionHydrating,
  ]);

  const openEditor = (sourceKey: string, toolName: string, output: unknown) => {
    if (!sessionId) return;
    const session = createEditorSession(sourceKey, toolName, output);
    if (!session) {
      console.warn('[chat-ui] open-editor-failed', {
        sourceKey,
        toolName,
      });
      return;
    }
    sessionEditorActions.setEditorSession(sessionId, session);
    sessionEditorActions.setCenterViewMode(sessionId, 'blocks');
  };

  const saveEditor = useCallback((session: EditorSession) => {
    if (!sessionId) return;
    const nextOutput = applyEditorSession(session);
    sessionEditorActions.upsertEditedToolOutput(
      sessionId,
      session.sourceKey,
      nextOutput,
    );
    persistEditorOutput(session, nextOutput);
    console.log('[chat-ui] blocks-saved', {
      sourceKey: session.sourceKey,
      toolName: session.toolName,
      blockCount: Array.isArray(nextOutput.blocks) ? nextOutput.blocks.length : 0,
    });
  }, [persistEditorOutput, sessionId]);

  const exportEditorCsv = useCallback((session: EditorSession) => {
    const nextOutput = applyEditorSession(session);
    const csvResult = buildGoogleMapsCsv(nextOutput);
    if (!csvResult) {
      alert('No spot with valid latitude/longitude to export.');
      return;
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(
      now.getMinutes(),
    ).padStart(2, '0')}`;
    const fileName = `${toFileSlug(session.title)}-${timestamp}.csv`;

    const blob = new Blob([csvResult.csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }, []);

  const generateHandbookFromEditor = useCallback((
    session: EditorSession,
    options?: {
      forcedStyle?: HandbookStyleId;
      persistStyleAsDefault?: boolean;
    },
  ) => {
    if (!sessionId) return;
    if (isBusy) return;
    const nextOutput = applyEditorSession(session);
    const blocks = Array.isArray(nextOutput.blocks) ? nextOutput.blocks : [];
    if (blocks.length === 0) {
      alert('Please add at least one block before generating handbook HTML.');
      return;
    }

    const styleId = options?.forcedStyle ?? handbookStyle ?? 'let-tabi-decide';
    if (options?.persistStyleAsDefault) {
      setHandbookStyle(styleId);
    }
    const styleLabel = getHandbookStyleLabel(styleId);
    const styleInstruction = getHandbookStyleInstruction(styleId);

    const payload = {
      title: session.title,
      videoId: session.videoId,
      videoUrl: session.videoUrl,
      thumbnailUrl: session.thumbnailUrl,
      blocks,
      handbookStyle: styleId,
    };

    sessionEditorActions.upsertEditedToolOutput(
      sessionId,
      session.sourceKey,
      nextOutput,
    );
    sessionEditorActions.setHandbookStatus(sessionId, 'generating');
    sessionEditorActions.setHandbookError(sessionId, null);
    sessionEditorActions.setHandbookHtml(sessionId, null);
    sessionEditorActions.setHandbookPreviewUrl(sessionId, null);
    sessionEditorActions.setCenterViewMode(sessionId, 'html');

    const prompt = [
      'Generate handbook HTML from edited blocks.',
      'If runtime already has prepared images from a completed search_image or generate_image step, reuse them and do not call an image tool again.',
      'If no prepared images are available, call exactly one image tool first: search_image or generate_image.',
      'Prefer search_image for real landmarks, cities, food, and architecture; use generate_image when stock photos are not suitable.',
      'After image tool finishes, call generate_handbook_html exactly once using HANDBOOK_INPUT_JSON as tool input.',
      'Do not call parse_youtube_input, crawl_youtube_videos, build_travel_blocks, or resolve_spot_coordinates.',
      `Use handbook style: ${styleLabel}.`,
      styleInstruction
        ? `Style direction: ${styleInstruction}`
        : 'If style is "Let Tabi decide", choose the most fitting visual style from the content.',
      'HANDBOOK_INPUT_JSON:',
      JSON.stringify(payload),
    ].join('\n');
    pendingToolbarGenerationRef.current = {
      beforeCount: countGenerateHandbookOutputs(messages),
    };
    sendMessage({ text: prompt });
  }, [handbookStyle, isBusy, messages, sendMessage, sessionId]);

  const openStyleConfirmModal = useCallback((session: EditorSession) => {
    if (!sessionId || isBusy) return;
    setPendingStyleSession(session);
    setSelectedStyleOption(toStyleSelection(handbookStyle));
    setSetAsSessionDefault(true);
    setIsStyleConfirmOpen(true);
  }, [handbookStyle, isBusy, sessionId]);

  const closeStyleConfirmModal = useCallback(() => {
    setIsStyleConfirmOpen(false);
    setPendingStyleSession(null);
  }, []);

  const submitStyleConfirmGenerate = useCallback(() => {
    if (!pendingStyleSession) return;
    const targetSession = pendingStyleSession;
    const targetStyle = selectedStyleOption;
    setIsStyleConfirmOpen(false);
    setPendingStyleSession(null);
    generateHandbookFromEditor(targetSession, {
      forcedStyle: targetStyle,
      persistStyleAsDefault: setAsSessionDefault,
    });
  }, [
    generateHandbookFromEditor,
    pendingStyleSession,
    selectedStyleOption,
    setAsSessionDefault,
  ]);

  useEffect(() => {
    if (!sessionId) return;

    const handleCenterToolbarAction = (event: Event) => {
      const { detail } = event as CustomEvent<CenterToolbarActionDetail>;
      if (!detail || detail.sessionId !== sessionId) return;
      if (!editorSession) return;

      if (detail.action === 'save') {
        saveEditor(editorSession);
        return;
      }

      if (detail.action === 'export') {
        exportEditorCsv(editorSession);
        return;
      }

      if (detail.action === 'generate') {
        openStyleConfirmModal(editorSession);
      }
    };

    window.addEventListener(
      CENTER_TOOLBAR_ACTION_EVENT,
      handleCenterToolbarAction as EventListener,
    );

    return () => {
      window.removeEventListener(
        CENTER_TOOLBAR_ACTION_EVENT,
        handleCenterToolbarAction as EventListener,
      );
    };
  }, [
    editorSession,
    exportEditorCsv,
    openStyleConfirmModal,
    saveEditor,
    sessionId,
  ]);

  useEffect(() => {
    if (!isStyleConfirmOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeStyleConfirmModal();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeStyleConfirmModal, isStyleConfirmOpen]);

  useEffect(() => {
    if (!sessionId || !isStyleConfirmOpen) return;
    if (pendingStyleSession) return;
    setIsStyleConfirmOpen(false);
  }, [isStyleConfirmOpen, pendingStyleSession, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const pending = pendingToolbarGenerationRef.current;
    if (!pending) return;
    if (isBusy) return;

    pendingToolbarGenerationRef.current = null;
    const afterCount = countGenerateHandbookOutputs(messages);
    const hasNewHandbookOutput = afterCount > pending.beforeCount;
    const hasRenderableHandbook = Boolean(handbookHtml || handbookPreviewUrl);

    if (hasNewHandbookOutput || hasRenderableHandbook) {
      return;
    }

    if (handbookStatus === 'generating') {
      sessionEditorActions.setHandbookStatus(sessionId, 'error');
      sessionEditorActions.setHandbookError(
        sessionId,
        'Generation did not reach generate_handbook_html. Please click Generate again.',
      );
      sessionEditorActions.setCenterViewMode(sessionId, 'html');
    }
  }, [handbookHtml, handbookPreviewUrl, handbookStatus, isBusy, messages, sessionId]);

  useEffect(() => {
    for (const message of messages) {
      message.parts.forEach((part, partIndex) => {
        if (!isToolPart(part)) return;

        const key = `${message.id}:${partIndex}:${part.type}:${part.state}`;
        if (loggedToolEventsRef.current.has(key)) return;
        loggedToolEventsRef.current.add(key);

        const toolName = part.type.replace('tool-', '');
        console.log('[chat-ui] tool-state', {
          messageId: message.id,
          toolName,
          state: part.state,
        });

        if (part.state === 'output-available') {
          const sourceKey = `${message.id}:${partIndex}:${part.type}`;
          const output = editedToolOutputs[sourceKey] ?? part.output;
          console.log(`[chat-ui] ${toolName} output-json`, output);

          if (toolName === 'generate_handbook_html') {
            if (!sessionId) return;
            if (!isRecord(output) || typeof output.html !== 'string') {
              sessionEditorActions.setHandbookStatus(sessionId, 'error');
              sessionEditorActions.setHandbookError(
                sessionId,
                'Handbook tool returned invalid HTML output.',
              );
              sessionEditorActions.setCenterViewMode(sessionId, 'html');
              return;
            }
            const previewUrl =
              typeof output.preview_url === 'string' && output.preview_url
                ? `${output.preview_url}?v=${
                    typeof output.generated_at === 'string'
                      ? encodeURIComponent(output.generated_at)
                      : Date.now()
                  }`
                : null;
            sessionEditorActions.setHandbookHtml(sessionId, output.html);
            sessionEditorActions.setHandbookPreviewUrl(sessionId, previewUrl);
            sessionEditorActions.setHandbookStatus(sessionId, 'ready');
            sessionEditorActions.setHandbookError(sessionId, null);
            sessionEditorActions.setCenterViewMode(sessionId, 'html');
          }
        }

        if (part.state === 'output-error') {
          console.error(`[chat-ui] ${toolName} output-error`, {
            messageId: message.id,
            errorText: part.errorText,
          });

          if (toolName === 'generate_handbook_html') {
            if (!sessionId) return;
            sessionEditorActions.setHandbookStatus(sessionId, 'error');
            sessionEditorActions.setHandbookPreviewUrl(sessionId, null);
            sessionEditorActions.setHandbookError(
              sessionId,
              part.errorText || 'Failed to generate handbook HTML.',
            );
            sessionEditorActions.setCenterViewMode(sessionId, 'html');
          }
        }
      });
    }
  }, [editedToolOutputs, messages, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    if (editorSession) return;

    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = messages[messageIndex];
      for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = message.parts[partIndex];
        if (!isToolPart(part)) continue;
        if (part.state !== 'output-available') continue;

        const toolName = part.type.replace('tool-', '');
        const sourceKey = `${message.id}:${partIndex}:${part.type}`;
        if (autoOpenedEditableSourceRef.current.has(sourceKey)) continue;

        const output = editedToolOutputs[sourceKey] ?? part.output;
        if (!canEditBlocks(toolName, part, output)) continue;

        const nextEditorSession = createEditorSession(sourceKey, toolName, output);
        if (!nextEditorSession) {
          autoOpenedEditableSourceRef.current.add(sourceKey);
          continue;
        }

        sessionEditorActions.setEditorSession(sessionId, nextEditorSession);
        sessionEditorActions.setCenterViewMode(sessionId, 'blocks');
        autoOpenedEditableSourceRef.current.add(sourceKey);
        return;
      }
    }
  }, [editedToolOutputs, editorSession, messages, sessionId]);

  const headerSubtitle = processState.stopped
    ? `Stopped at ${formatToolLabel(processState.currentStep)}`
    : processState.error || processState.failedStep
    ? `Failed at ${formatToolLabel(processState.failedStep)}`
    : processState.loading
      ? `Running ${formatToolLabel(processState.currentStep)}`
      : processState.completedSteps.length > 0
        ? `Completed ${processState.completedSteps.length}/${SESSION_TOOL_ORDER.length} steps`
        : 'Refine your guide';

  const editorHost =
    typeof document === 'undefined'
      ? null
      : document.getElementById('block-editor-panel-root');
  const showBlocksView = centerViewMode === 'blocks';
  const showHtmlView = centerViewMode === 'html';
  const showBlocksLoadingState = Boolean(
    showBlocksView &&
      !editorSession &&
      !processState.error &&
      !processState.failedStep,
  );
  const centerLoadingLabel = 'Loading guide...';
  const shouldRenderPreviewPortal = Boolean(
    isSessionHydrating ||
      showBlocksLoadingState ||
      editorSession ||
      handbookHtml ||
      handbookPreviewUrl ||
      handbookStatus !== 'idle',
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-elevated">
      <div className="border-b border-border-light px-5 pb-4 pt-5">
        <h1 className="truncate text-[15px] font-semibold leading-[1.35] text-text-primary">
          {currentSessionSummary?.title || 'Untitled Guide'}
        </h1>
        <p className="mt-1 text-[12px] font-medium leading-4 text-text-tertiary">
          {headerSubtitle}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
                    onOpenEditor={openEditor}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form
        className="border-t border-border-light bg-bg-elevated px-4 py-4"
        onSubmit={e => {
          e.preventDefault();
          const prompt = toGuidePrompt(input);
          if (!prompt) {
            setInputError('Please enter a prompt or YouTube URL.');
            return;
          }

          sendMessage({ text: prompt });
          setInput('');
          setInputError('');
        }}
      >
        <div className="w-full">
          <div className="flex items-center gap-2">
            <input
              id="chat-input"
              className="h-11 w-full rounded-[12px] border border-transparent bg-bg-secondary px-4 text-[14px] text-text-primary outline-none transition placeholder:text-text-tertiary focus:border-accent-primary focus:bg-bg-elevated"
              value={input}
              placeholder="Ask me to refine the guide..."
              onChange={e => {
                setInput(e.currentTarget.value);
                if (inputError) setInputError('');
              }}
            />
            {isBusy && (
              <button
                type="button"
                onClick={async () => {
                  await stop();
                  sessionActions.markStopped();
                  if (sessionId) {
                    sessionsActions.updateSession(sessionId, {
                      meta: 'Stopped',
                      isError: false,
                      status: 'cancelled',
                      lastStep: processState.currentStep,
                    });
                    void fetch(`/api/sessions/${sessionId}/cancel`, {
                      method: 'POST',
                    });
                  }
                }}
                className="h-11 shrink-0 rounded-[12px] border border-border-default bg-bg-elevated px-3 text-[12px] font-medium text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary"
              >
                Stop
              </button>
            )}
            <button
              type="submit"
              disabled={isBusy}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent-primary text-text-inverse transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-border-default disabled:text-text-tertiary"
            >
              {isBusy ? (
                <LuLoader className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <LuSendHorizontal className="h-[18px] w-[18px]" />
              )}
              <span className="sr-only">{isBusy ? 'Running' : 'Send'}</span>
            </button>
          </div>
          {inputError && <p className="mt-1 text-[11px] font-medium ui-text-error">{inputError}</p>}
        </div>
      </form>

      {editorHost && shouldRenderPreviewPortal
        ? createPortal(
            <div className="absolute inset-0">
              {showHtmlView && !isSessionHydrating && (
                <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-bg-primary px-6 pt-0">
                  <div
                    className="relative h-full overflow-hidden rounded-[12px] border border-border-light bg-bg-elevated transition-[width,max-height] duration-200"
                    style={{
                      width: `min(100%, ${previewFrameWidth}px)`,
                      maxWidth: '100%',
                      maxHeight: previewFrameMaxHeight,
                    }}
                  >
                    <div className="flex h-10 items-center gap-3 border-b border-border-light bg-bg-secondary px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-rose-500" />
                        <span className="h-3 w-3 rounded-full bg-amber-400" />
                        <span className="h-3 w-3 rounded-full bg-emerald-500" />
                      </div>
                      <div className="flex h-7 flex-1 items-center rounded-[6px] bg-bg-elevated px-3 text-[12px] font-normal text-text-tertiary">
                        {previewAddress}
                      </div>
                    </div>

                    <div className="relative h-[calc(100%-40px)] overflow-hidden bg-bg-elevated">
                      {handbookPreviewUrl && (
                        <iframe
                          title="Guide Preview"
                          src={handbookPreviewUrl}
                          className="absolute inset-0 h-full w-full bg-bg-elevated"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        />
                      )}

                      {!handbookPreviewUrl && handbookHtml && (
                        <iframe
                          title="Guide Preview"
                          srcDoc={handbookHtml}
                          className="absolute inset-0 h-full w-full bg-bg-elevated"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        />
                      )}

                      {!handbookHtml && handbookStatus === 'generating' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated">
                          <p className="text-sm font-medium text-text-tertiary">
                            Generating guide HTML...
                          </p>
                        </div>
                      )}

                      {!handbookHtml && handbookStatus === 'error' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated px-6 text-center">
                          <p className="max-w-lg text-sm font-medium text-status-error">
                            {handbookError || 'Failed to generate guide HTML.'}
                          </p>
                        </div>
                      )}

                      {!handbookPreviewUrl &&
                        !handbookHtml &&
                        handbookStatus !== 'generating' &&
                        handbookStatus !== 'error' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated px-6 text-center">
                            <p className="max-w-lg text-sm font-medium text-text-tertiary">
                              No guide HTML yet. Generate once, then switch between HTML and
                              blocks without regenerating.
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              )}

              {showBlocksView && editorSession && !isSessionHydrating && (
                <div className="absolute inset-0 z-20">
                  <BlockEditorWorkspace
                    session={editorSession}
                    onChange={nextSession =>
                      sessionEditorActions.setEditorSession(sessionId, nextSession)
                    }
                  />
                </div>
              )}

              {showBlocksView &&
                !editorSession &&
                !showBlocksLoadingState &&
                !isSessionHydrating && (
                <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated px-6 text-center">
                  <p className="max-w-lg text-sm font-medium text-text-tertiary">
                    No editable blocks available yet. Once resolve output is ready, blocks editor
                    will open automatically here.
                  </p>
                </div>
              )}

              {(isSessionHydrating || showBlocksLoadingState) && (
                <MainContentLoadingState label={centerLoadingLabel} />
              )}

              {isStyleConfirmOpen && showBlocksView && pendingStyleSession && (
                <div
                  className="absolute inset-0 z-40 flex items-center justify-center bg-[#2D2A26]/38 px-6 backdrop-blur-[2px]"
                  onClick={closeStyleConfirmModal}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Choose style for this generation"
                    className="w-full max-w-[520px] rounded-[20px] border border-border-light bg-bg-elevated p-6 shadow-[0_16px_42px_rgba(26,23,20,0.14)]"
                    onClick={event => event.stopPropagation()}
                  >
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                        Before Generate
                      </p>
                      <h2 className="text-[28px] font-bold tracking-[-0.02em] text-text-primary">
                        Choose your guide&apos;s aesthetic
                      </h2>
                      <p className="text-[13px] leading-[1.45] text-text-secondary">
                        Match your channel&apos;s visual identity for this run.
                      </p>
                    </div>

                    <p className="mt-6 text-[15px] font-semibold text-text-primary">
                      Aesthetic
                    </p>
                    <div className="mt-3 flex flex-nowrap items-start justify-between gap-1">
                      {HANDBOOK_STYLE_OPTIONS.map(option => {
                        const selected = selectedStyleOption === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSelectedStyleOption(option.id)}
                            aria-pressed={selected}
                            className="group relative w-[80px] p-0 text-center transition"
                          >
                            {renderStyleSelectionPreview(option.id, selected)}
                            <span
                              className={`mt-2 block whitespace-pre-line text-[13px] font-medium leading-[1.25] ${
                                selected
                                  ? 'text-text-primary'
                                  : 'text-text-secondary'
                              }`}
                            >
                              {getStyleSelectionLabel(option.id)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setSetAsSessionDefault(value => !value)}
                      className="mt-5 inline-flex items-center gap-2 rounded-[8px] py-1 text-left"
                    >
                      <span
                        className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] transition ${
                          setAsSessionDefault
                            ? 'bg-accent-primary text-text-inverse'
                            : 'border border-border-default bg-bg-elevated text-transparent'
                        }`}
                      >
                        <LuCheck className="h-3 w-3" />
                      </span>
                      <span className="text-[13px] font-medium text-text-secondary">
                        Set as session default
                      </span>
                    </button>

                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={closeStyleConfirmModal}
                        className="inline-flex h-11 items-center justify-center rounded-[12px] border border-border-light bg-bg-secondary px-[18px] text-[14px] font-semibold text-text-secondary transition hover:bg-bg-elevated"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitStyleConfirmGenerate}
                        disabled={isBusy}
                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[14px] bg-gradient-to-r from-[#F97066] to-[#FB923C] px-5 text-[14px] font-semibold text-text-inverse transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span>Generate</span>
                        <LuArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>,
            editorHost,
          )
        : null}
    </div>
  );
}
