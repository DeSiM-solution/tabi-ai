'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { ChatHeader } from './_components/chat-header';
import { ChatInput } from './_components/chat-input';
import { ChatMessages } from './_components/chat-messages';
import { SessionBlocksPanel } from './_components/session-blocks-panel';
import { SessionHtmlPanel } from './_components/session-html-panel';
import { SessionLoadingOverlay } from './_components/session-loading-overlay';
import { SessionStyleConfirmModal } from './_components/session-style-confirm-modal';
import {
  generateHandbookFromEditor as generateHandbookFromEditorAction,
  type PendingGeneratingHandbookVersion,
} from './_actions/handbook-actions';
import {
  exportEditorSessionCsv,
  persistEditorOutput as persistEditorOutputAction,
  saveEditorSession,
  type CsvExportGuideState,
} from './_actions/editor-actions';
import {
  activateHandbookVersion as activateHandbookVersionAction,
  deleteHandbookVersion,
} from './_actions/handbook-version-actions';
import {
  sessionEditorActions,
  useSessionEditorSnapshot,
} from './_stores/session-editor-store';
import { useEditorImageBackfill } from './_hooks/use-editor-image-backfill';
import { useHtmlPreviewLoading } from './_hooks/use-html-preview-loading';
import { useSessionHydration } from './_hooks/use-session-hydration';
import { useToolOutputListener } from './_hooks/use-tool-output-listener';
import { useUnsavedGuard } from './_hooks/use-unsaved-guard';
import { useVersionMenuClose } from './_hooks/use-version-menu-close';
import {
  createEditorSession,
  toGuidePrompt,
  type EditorSession,
  type UnknownRecord,
} from './_lib/chat-utils';
import { countGenerateHandbookOutputs } from './_lib/handbook-generation-utils';
import {
  isGeneratingHandbookPlaceholderTitle,
} from './_lib/handbook-utils';
import {
  persistCachedSessionMessages,
} from './_lib/message-cache';
import { compactChatMessagesForChatApi } from './_lib/message-compact';
import { toGuidePreviewPath, toPreviewAddress } from './_lib/preview-utils';
import { patchSessionState } from './_lib/session-api';
import { toEditorSessionSignature } from './_lib/editor-session-utils';
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
import {
  handbooksActions,
  useSessionHandbooksState,
} from '@/stores/handbooks-store';
import { useAuthStore } from '@/stores/auth-store';
import { useHydrateAuthStore } from '@/stores/use-hydrate-auth-store';
import { formatSessionDate } from '@/lib/session-time';
import {
  normalizeHandbookStyle,
  type HandbookStyleId,
} from '@/lib/handbook-style';
import { type HandbookLifecycle } from '@/lib/handbook-lifecycle';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { CsvExportGuideDialog } from '@/components/csv-export-guide-dialog';
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog';
function toStyleSelection(value: HandbookStyleId | null | undefined): HandbookStyleId {
  return value ?? 'minimal-tokyo';
}

type HandbookVersionMenuItem = {
  id: string;
  title: string;
  lifecycle: HandbookLifecycle;
  createdAt: string;
  isPending: boolean;
  isGenerating: boolean;
};

export default function Chat() {
  const params = useParams<{ id: string }>();
  const sessionId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialInput = searchParams.get('initial') ?? '';
  const initialStyle = searchParams.get('style');
  const authUser = useAuthStore(state => state.user);
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
  const sessionHandbooksState = useSessionHandbooksState(sessionId);
  const {
    editedToolOutputs,
    editorSession,
    activeHandbookId,
    handbookHtml,
    handbookPreviewUrl,
    handbookStatus,
    handbookError,
    centerViewMode,
    previewDevice,
    isSavingBlocks,
  } = editorState;

  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [isSessionHydrating, setIsSessionHydrating] = useState(false);
  const [hydratedToolDurations, setHydratedToolDurations] = useState<Record<string, number>>(
    {},
  );
  const [handbookStyle, setHandbookStyle] = useState<HandbookStyleId | null>(
    () => normalizeHandbookStyle(initialStyle),
  );
  const [isStyleConfirmOpen, setIsStyleConfirmOpen] = useState(false);
  const [pendingStyleSession, setPendingStyleSession] =
    useState<EditorSession | null>(null);
  const [selectedStyleOption, setSelectedStyleOption] =
    useState<HandbookStyleId>('minimal-tokyo');
  const [setAsSessionDefault, setSetAsSessionDefault] = useState(true);
  const [editorHost, setEditorHost] = useState<HTMLElement | null>(null);
  const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false);
  const [isRemovingHandbookVersion, setIsRemovingHandbookVersion] = useState(false);
  const [pendingDeleteHandbookVersionId, setPendingDeleteHandbookVersionId] = useState<
    string | null
  >(null);
  const [pendingGeneratingHandbookVersion, setPendingGeneratingHandbookVersion] = useState<
    PendingGeneratingHandbookVersion | null
  >(null);
  const [isGeneratingNewHandbook, setIsGeneratingNewHandbook] = useState(false);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [csvExportGuide, setCsvExportGuide] = useState<CsvExportGuideState | null>(
    null,
  );
  const versionMenuRef = useRef<HTMLDivElement | null>(null);
  const isGuestUser = authUser?.isGuest ?? true;
  useHydrateAuthStore();

  const didSendInitialInputRef = useRef(false);
  const pendingToolbarGenerationRef = useRef<{ beforeCount: number } | null>(null);
  const persistedHandbookStyleRef = useRef<string>('');
  const persistingHandbookStyleKeyRef = useRef<string | null>(null);
  const pendingGeneratingHandbookVersionRef =
    useRef<PendingGeneratingHandbookVersion | null>(null);
  const lastSavedEditorSignatureRef = useRef<{
    sourceKey: string;
    signature: string;
  } | null>(null);
  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: {
          sessionId,
          handbookStyle,
        },
      }),
    [handbookStyle, sessionId],
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: sessionId || undefined,
    transport: chatTransport,
  });
  const isBusy = status === 'submitted' || status === 'streaming';
  const isPendingGeneratingHandbookActive = Boolean(
    pendingGeneratingHandbookVersion
    && activeHandbookId === pendingGeneratingHandbookVersion.handbookId,
  );
  const activePersistedHandbookSummary = activeHandbookId
    ? (
      sessionHandbooksState.handbooks.find(handbook => handbook.id === activeHandbookId)
      ?? null
    )
    : null;
  const isPersistedGeneratingHandbookActive = isGeneratingHandbookPlaceholderTitle(
    activePersistedHandbookSummary?.title,
  );
  const isGeneratingHandbookAddressState =
    isPendingGeneratingHandbookActive || isPersistedGeneratingHandbookActive;
  const guidePreviewPath = activeHandbookId
    ? `/api/guide/${activeHandbookId}`
    : sessionId
      ? `/api/guide/${sessionId}`
      : '/api/guide';
  const previewAddress = useMemo(
    () =>
      isGeneratingHandbookAddressState
        ? 'Generating Handbook...'
        : toPreviewAddress(handbookPreviewUrl, guidePreviewPath),
    [guidePreviewPath, handbookPreviewUrl, isGeneratingHandbookAddressState],
  );
  const previewFrameWidth = previewDevice === 'mobile' ? 375 : 720;
  const previewFrameMaxHeight = 'calc(100vh - 128px)';
  const {
    htmlPreviewLoadPhase,
    showHtmlPreviewOverlay,
    previewFrameOpacityClass,
    handleHtmlPreviewLoad,
    resetHtmlPreviewLoadPhase,
  } = useHtmlPreviewLoading({
    centerViewMode,
    isSessionHydrating,
    handbookPreviewUrl,
    handbookHtml,
  });

  const {
    isLeaveConfirmOpen,
    cancelLeaveWithUnsavedWarning,
    confirmLeaveWithUnsavedWarning,
  } = useUnsavedGuard({
    isDirty: isEditorDirty,
    router,
    resetKey: sessionId,
  });

  useSessionHydration({
    sessionId,
    setMessages,
    setHydratedToolDurations,
    setHandbookStyle,
    setIsSessionHydrating,
    persistedHandbookStyleRef,
  });


  const markEditorSessionAsSaved = useCallback((session: EditorSession) => {
    lastSavedEditorSignatureRef.current = {
      sourceKey: session.sourceKey,
      signature: toEditorSessionSignature(session),
    };
    setIsEditorDirty(false);
  }, []);

  const clearPendingGeneratingHandbookVersion = useCallback((
    options?: {
      nextActiveHandbookId?: string | null;
      restorePreviousActive?: boolean;
      removePersisted?: boolean;
    },
  ) => {
    const pending = pendingGeneratingHandbookVersionRef.current;
    if (!pending || !sessionId) return;

    sessionEditorActions.removeHandbookState(sessionId, pending.handbookId);

    if (options?.nextActiveHandbookId !== undefined) {
      sessionEditorActions.setActiveHandbookId(
        sessionId,
        options.nextActiveHandbookId ?? null,
      );
    } else if (options?.restorePreviousActive) {
      sessionEditorActions.setActiveHandbookId(
        sessionId,
        pending.previousActiveHandbookId ?? null,
      );
    }

    if (options?.removePersisted && pending.persisted) {
      void handbooksActions.removeHandbook(sessionId, pending.handbookId)
        .then(() => {
          if (!options.restorePreviousActive) return;
          if (!pending.previousActiveHandbookId) return;
          return handbooksActions.setActiveHandbook(
            sessionId,
            pending.previousActiveHandbookId,
          );
        })
        .catch(error => {
          console.error('[chat-ui] remove-pending-handbook-failed', {
            sessionId,
            handbookId: pending.handbookId,
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }

    pendingGeneratingHandbookVersionRef.current = null;
    setPendingGeneratingHandbookVersion(null);
  }, [sessionId]);

  useToolOutputListener({
    sessionId,
    messages,
    editedToolOutputs,
    currentSessionTitle: currentSessionSummary?.title,
    activeHandbookId,
    isGuestUser,
    editorSession,
    pendingGeneratingHandbookVersionRef,
    clearPendingGeneratingHandbookVersion,
    setIsGeneratingNewHandbook,
  });

  const requireLogin = useCallback((description: string): boolean => {
    if (!isGuestUser) return true;
    toast.warning('Please login to continue.', {
      description,
    });
    return false;
  }, [isGuestUser]);

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

  const imageBackfillSignal = useMemo(() => {
    let count = 0;
    for (const message of messages) {
      for (const part of message.parts) {
        if (!('type' in part) || typeof part.type !== 'string') continue;
        if (part.type !== 'tool-search_image' && part.type !== 'tool-generate_image') {
          continue;
        }
        if (!('state' in part) || part.state !== 'output-available') continue;
        count += 1;
      }
    }
    return count;
  }, [messages]);

  const persistEditorOutput = useCallback(async (
    session: EditorSession,
    output: UnknownRecord,
  ): Promise<boolean> => {
    return persistEditorOutputAction({
      sessionId,
      session,
      output,
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setIsSessionHydrating(false);
      return;
    }
    persistedHandbookStyleRef.current = '';
    persistingHandbookStyleKeyRef.current = null;
    setIsSessionHydrating(true);
    setHydratedToolDurations({});
    setHandbookStyle(null);
    setMessages([]);
    setPendingGeneratingHandbookVersion(null);
    setIsGeneratingNewHandbook(false);
    setIsEditorDirty(false);
    lastSavedEditorSignatureRef.current = null;
    pendingGeneratingHandbookVersionRef.current = null;
    sessionActions.reset();
    sessionActions.setSessionId(sessionId);
    sessionEditorActions.ensureSession(sessionId);
    handbooksActions.ensureSession(sessionId);
  }, [sessionId, setMessages]);

  useEffect(() => {
    const styleFromQuery = normalizeHandbookStyle(initialStyle);
    if (!styleFromQuery) return;
    setHandbookStyle(styleFromQuery);
  }, [initialStyle, sessionId]);

  useEffect(() => {
    setEditorHost(document.getElementById('block-editor-panel-root'));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    sessionActions.syncFromMessages(sessionId, messages, editedToolOutputs, isBusy);
  }, [editedToolOutputs, isBusy, messages, sessionId]);

  useEffect(() => {
    if (!editorSession) {
      setIsEditorDirty(false);
      lastSavedEditorSignatureRef.current = null;
      return;
    }

    const currentSignature = toEditorSessionSignature(editorSession);
    const saved = lastSavedEditorSignatureRef.current;
    if (!saved || saved.sourceKey !== editorSession.sourceKey) {
      lastSavedEditorSignatureRef.current = {
        sourceKey: editorSession.sourceKey,
        signature: currentSignature,
      };
      setIsEditorDirty(false);
      return;
    }

    setIsEditorDirty(saved.signature !== currentSignature);
  }, [editorSession]);

  useEffect(() => {
    if (!isSavingBlocks) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }, [isSavingBlocks]);

  useEffect(() => {
    if (!sessionId) return;
    if (isSessionHydrating) return;
    if (messages.length === 0) return;
    persistCachedSessionMessages(sessionId, messages);
  }, [isSessionHydrating, messages, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    sessionEditorActions.hydrateHandbooks(sessionId, {
      activeHandbookId: sessionHandbooksState.activeHandbookId,
      handbooks: sessionHandbooksState.handbooks.map(handbook => {
        const generatingPlaceholder = isGeneratingHandbookPlaceholderTitle(handbook.title);
        const basePreviewPath = handbook.previewPath
          ? toGuidePreviewPath(handbook.previewPath, handbook.id)
          : `/api/guide/${handbook.id}`;
        const cacheVersion = encodeURIComponent(handbook.generatedAt ?? handbook.updatedAt);
        return {
          handbookId: handbook.id,
          title: handbook.title,
          lifecycle: handbook.lifecycle,
          previewUrl: generatingPlaceholder ? null : `${basePreviewPath}?v=${cacheVersion}`,
          status: generatingPlaceholder ? 'generating' : 'ready',
          error: null,
        };
      }),
    });
  }, [
    sessionHandbooksState.activeHandbookId,
    sessionHandbooksState.handbooks,
    sessionId,
  ]);

  useEffect(() => {
    if (!sessionId || !handbookStyle) return;
    if (isSessionHydrating) return;
    if (!authUser?.id) return;
    if (!currentSessionSummary) return;
    const styleKey = `${sessionId}:${handbookStyle}`;
    if (persistedHandbookStyleRef.current === styleKey) return;
    if (persistingHandbookStyleKeyRef.current === styleKey) return;

    persistingHandbookStyleKeyRef.current = styleKey;
    let cancelled = false;

    const persistStyle = async () => {
      const saved = await patchSessionState(sessionId, {
        context: {
          handbookStyle,
        },
      });
      if (cancelled) return;

      persistingHandbookStyleKeyRef.current = null;
      if (saved) {
        persistedHandbookStyleRef.current = styleKey;
      }
    };

    void persistStyle();

    return () => {
      cancelled = true;
      if (persistingHandbookStyleKeyRef.current === styleKey) {
        persistingHandbookStyleKeyRef.current = null;
      }
    };
  }, [
    authUser?.id,
    currentSessionSummary,
    handbookStyle,
    isSessionHydrating,
    sessionId,
  ]);

  useEffect(() => {
    if (didSendInitialInputRef.current) return;
    if (!initialInput.trim()) return;
    if (isGuestUser) return;

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
  }, [initialInput, isGuestUser, pathname, router, sendMessage]);

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
        meta: formatToolLabel(processState.currentStep),
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
        meta: formatSessionDate(startedAt),
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
    if (!requireLogin('Editing blocks requires an account login.')) return;
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

  const saveEditor = useCallback(async (session: EditorSession) => {
    await saveEditorSession({
      sessionId,
      session,
      isSavingBlocks,
      requireLogin,
      markEditorSessionAsSaved,
    });
  }, [isSavingBlocks, markEditorSessionAsSaved, requireLogin, sessionId]);

  const exportEditorCsv = useCallback((session: EditorSession) => {
    exportEditorSessionCsv(session, setCsvExportGuide);
  }, []);

  const generateHandbookFromEditor = useCallback(async (
    session: EditorSession,
    options?: {
      forcedStyle?: HandbookStyleId;
      persistStyleAsDefault?: boolean;
    },
  ) => {
    await generateHandbookFromEditorAction({
      sessionId,
      session,
      options,
      isBusy,
      handbookStyle,
      activeHandbookId,
      messages,
      requireLogin,
      persistEditorOutput,
      setHandbookStyle,
      setMessages,
      sendMessage,
      pendingGeneratingHandbookVersionRef,
      setPendingGeneratingHandbookVersion,
      setIsGeneratingNewHandbook,
      resetHtmlPreviewLoadPhase,
      pendingToolbarGenerationRef,
    });
  }, [
    activeHandbookId,
    handbookStyle,
    isBusy,
    messages,
    persistEditorOutput,
    requireLogin,
    resetHtmlPreviewLoadPhase,
    sendMessage,
    sessionId,
    setMessages,
  ]);

  const openStyleConfirmModal = useCallback((session: EditorSession) => {
    if (!requireLogin('Manual HTML generation requires an account login.')) return;
    if (!sessionId || isBusy) return;
    setPendingStyleSession(session);
    setSelectedStyleOption(toStyleSelection(handbookStyle));
    setSetAsSessionDefault(true);
    setIsStyleConfirmOpen(true);
  }, [handbookStyle, isBusy, requireLogin, sessionId]);

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
      const pending = pendingGeneratingHandbookVersionRef.current;
      const errorTargetHandbookId = pending?.previousActiveHandbookId ?? activeHandbookId;
      if (pending) {
        clearPendingGeneratingHandbookVersion({
          restorePreviousActive: true,
          removePersisted: true,
        });
      }
      setIsGeneratingNewHandbook(false);
      sessionEditorActions.setHandbookStatus(sessionId, 'error', errorTargetHandbookId);
      sessionEditorActions.setHandbookError(
        sessionId,
        'Generation did not reach generate_handbook_html. Please click Generate again.',
        errorTargetHandbookId,
      );
      sessionEditorActions.setCenterViewMode(sessionId, 'html');
    }
  }, [
    activeHandbookId,
    clearPendingGeneratingHandbookVersion,
    handbookHtml,
    handbookPreviewUrl,
    handbookStatus,
    isBusy,
    messages,
    sessionId,
  ]);

  useEditorImageBackfill({
    sessionId,
    centerViewMode,
    editorSession,
    backfillSignal: imageBackfillSignal,
    markEditorSessionAsSaved,
  });

  const headerSubtitle = processState.stopped
    ? `Stopped at ${formatToolLabel(processState.currentStep)}`
    : processState.error || processState.failedStep
    ? `Failed at ${formatToolLabel(processState.failedStep)}`
    : processState.loading
      ? formatToolLabel(processState.currentStep)
      : processState.completedSteps.length > 0
        ? `Completed ${processState.completedSteps.length}/${SESSION_TOOL_ORDER.length} steps`
        : 'Refine your guide';

  const showBlocksView = centerViewMode === 'blocks';
  const showHtmlView = centerViewMode === 'html';
  const handbookVersionMenuItems = useMemo<HandbookVersionMenuItem[]>(() => {
    const persistedItems = sessionHandbooksState.handbooks.map(handbook => ({
      id: handbook.id,
      title: handbook.title,
      lifecycle: handbook.lifecycle,
      createdAt: handbook.createdAt,
      isPending: false,
      isGenerating: isGeneratingHandbookPlaceholderTitle(handbook.title),
    }));
    if (!pendingGeneratingHandbookVersion) return persistedItems;
    if (persistedItems.some(item => item.id === pendingGeneratingHandbookVersion.handbookId)) {
      return persistedItems;
    }
    return [
      {
        id: pendingGeneratingHandbookVersion.handbookId,
        title: pendingGeneratingHandbookVersion.title,
        lifecycle: 'DRAFT',
        createdAt: pendingGeneratingHandbookVersion.createdAt,
        isPending: true,
        isGenerating: handbookStatus === 'generating' || isGeneratingNewHandbook,
      },
      ...persistedItems,
    ];
  }, [
    handbookStatus,
    isGeneratingNewHandbook,
    pendingGeneratingHandbookVersion,
    sessionHandbooksState.handbooks,
  ]);
  const activeHandbook = activeHandbookId
    ? (
      handbookVersionMenuItems.find(
        handbook => handbook.id === activeHandbookId,
      ) ?? null
    )
    : null;
  const isGeneratingHandbookActive = Boolean(activeHandbook?.isGenerating);
  const pendingDeleteHandbookVersion = pendingDeleteHandbookVersionId
    ? (
      sessionHandbooksState.handbooks.find(
        handbook => handbook.id === pendingDeleteHandbookVersionId,
      ) ?? null
    )
    : null;
  const isSessionSummaryLoading = currentSessionSummary?.status === 'loading';
  const shouldShowBlocksLoadingByProcess =
    (isSessionSummaryLoading || processState.loading) &&
    !processState.error &&
    !processState.failedStep;
  const showBlocksLoadingState = Boolean(
    showBlocksView &&
      !editorSession &&
      shouldShowBlocksLoadingByProcess,
  );
  const showNewHandbookLoadingState = Boolean(
    showHtmlView &&
      !isSessionHydrating &&
      handbookStatus === 'generating' &&
      (isGeneratingNewHandbook || isGeneratingHandbookActive),
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

  useEffect(() => {
    if (!sessionId) return;
    if (centerViewMode === 'blocks') return;
    if (isSessionHydrating) return;
    if (!isSessionSummaryLoading && !processState.loading) return;
    if (editorSession || handbookHtml || handbookPreviewUrl) return;
    sessionEditorActions.setCenterViewMode(sessionId, 'blocks');
  }, [
    centerViewMode,
    editorSession,
    handbookHtml,
    handbookPreviewUrl,
    isSessionHydrating,
    isSessionSummaryLoading,
    processState.loading,
    sessionId,
  ]);

  useVersionMenuClose({
    isOpen: isVersionMenuOpen,
    showHtmlView,
    menuRef: versionMenuRef,
    setIsOpen: setIsVersionMenuOpen,
  });

  const activateHandbookVersion = useCallback(async (nextHandbookId: string) => {
    if (!sessionId || !nextHandbookId) return;
    if (nextHandbookId === activeHandbookId) {
      setIsVersionMenuOpen(false);
      return;
    }
    setIsVersionMenuOpen(false);
    try {
      await activateHandbookVersionAction({
        sessionId,
        nextHandbookId,
        activeHandbookId,
      });
    } catch (error) {
      console.error('[chat-ui] activate-handbook-version-failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to switch handbook.');
    }
  }, [activeHandbookId, sessionId]);

  const requestDeleteHandbookVersion = useCallback((handbookId: string) => {
    if (!handbookId || isRemovingHandbookVersion) return;
    setIsVersionMenuOpen(false);
    setPendingDeleteHandbookVersionId(handbookId);
  }, [isRemovingHandbookVersion]);

  const confirmDeleteHandbookVersion = useCallback(async () => {
    if (!sessionId || !pendingDeleteHandbookVersionId) return;
    const handbookId = pendingDeleteHandbookVersionId;
    setPendingDeleteHandbookVersionId(null);
    setIsRemovingHandbookVersion(true);
    try {
      const result = await deleteHandbookVersion({
        sessionId,
        handbookId,
      });
      if (!result.removed) {
        toast.error('Handbook not found.');
        return;
      }
      toast.success('Handbook deleted.');
    } catch (error) {
      console.error('[chat-ui] delete-handbook-version-failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete handbook.');
    } finally {
      setIsRemovingHandbookVersion(false);
      setIsVersionMenuOpen(false);
    }
  }, [pendingDeleteHandbookVersionId, sessionId]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    if (inputError) setInputError('');
  }, [inputError]);

  const handleChatSubmit = useCallback(() => {
    if (!requireLogin('Sending chat messages requires an account login.')) return;
    const prompt = toGuidePrompt(input);
    if (!prompt) {
      setInputError('Please enter a prompt or YouTube URL.');
      return;
    }

    const compactedMessages = compactChatMessagesForChatApi(messages);
    const shouldDelaySendAfterCompaction = compactedMessages !== messages;
    if (shouldDelaySendAfterCompaction) {
      setMessages(compactedMessages);
      window.setTimeout(() => {
        sendMessage({ text: prompt });
      }, 0);
    } else {
      sendMessage({ text: prompt });
    }
    setInput('');
    setInputError('');
  }, [input, messages, requireLogin, sendMessage, setMessages]);

  const handleStopRequest = useCallback(async () => {
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
  }, [processState.currentStep, sessionId, stop]);

  const handleSelectHandbookVersion = useCallback((handbook: HandbookVersionMenuItem) => {
    if (handbook.isPending) {
      sessionEditorActions.setActiveHandbookId(sessionId, handbook.id);
      setIsVersionMenuOpen(false);
      return;
    }
    void activateHandbookVersion(handbook.id);
  }, [activateHandbookVersion, sessionId, setIsVersionMenuOpen]);

  const hasRenderableHandbook =
    handbookStatus === 'ready' || Boolean(handbookPreviewUrl || handbookHtml);
  const showStyleConfirmModal = Boolean(
    isStyleConfirmOpen && showBlocksView && pendingStyleSession,
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-elevated">
      <ChatHeader
        title={currentSessionSummary?.title || 'Untitled Guide'}
        subtitle={headerSubtitle}
      />

      <ChatMessages
        sessionId={sessionId}
        isSessionHydrating={isSessionHydrating}
        messages={messages}
        firstUserTextMessage={firstUserTextMessage}
        editedToolOutputs={editedToolOutputs}
        persistedToolDurations={hydratedToolDurations}
        handbookStyle={handbookStyle}
        isRequestBusy={isBusy}
        hasRenderableHandbook={hasRenderableHandbook}
        onOpenEditor={openEditor}
      />

      <ChatInput
        value={input}
        inputError={inputError}
        isBusy={isBusy}
        onChange={handleInputChange}
        onSubmit={handleChatSubmit}
        onStop={handleStopRequest}
      />

      {editorHost && shouldRenderPreviewPortal
        ? createPortal(
            <div className="absolute inset-0">
              {showHtmlView && !isSessionHydrating && (
                <SessionHtmlPanel
                  isSessionHydrating={isSessionHydrating}
                  previewFrameWidth={previewFrameWidth}
                  previewFrameMaxHeight={previewFrameMaxHeight}
                  previewFrameOpacityClass={previewFrameOpacityClass}
                  showNewHandbookLoadingState={showNewHandbookLoadingState}
                  showHtmlPreviewOverlay={showHtmlPreviewOverlay}
                  htmlPreviewLoadPhase={htmlPreviewLoadPhase}
                  handbookPreviewUrl={handbookPreviewUrl}
                  handbookHtml={handbookHtml}
                  handbookStatus={handbookStatus}
                  handbookError={handbookError}
                  onHtmlPreviewLoad={handleHtmlPreviewLoad}
                  handbookVersionMenuItems={handbookVersionMenuItems}
                  activeHandbookId={activeHandbookId}
                  activeHandbook={activeHandbook}
                  previewAddress={previewAddress}
                  isVersionMenuOpen={isVersionMenuOpen}
                  isRemovingHandbookVersion={isRemovingHandbookVersion}
                  versionMenuRef={versionMenuRef}
                  onToggleVersionMenu={() => setIsVersionMenuOpen(open => !open)}
                  onSelectHandbook={handleSelectHandbookVersion}
                  onRequestDeleteHandbook={requestDeleteHandbookVersion}
                />
              )}

              {showBlocksView && (
                <SessionBlocksPanel
                  editorSession={editorSession}
                  isSessionHydrating={isSessionHydrating}
                  isSavingBlocks={isSavingBlocks}
                  onChangeEditorSession={nextSession => {
                    sessionEditorActions.setEditorSession(sessionId, nextSession);
                  }}
                  showBlocksLoadingState={showBlocksLoadingState}
                />
              )}

              {(isSessionHydrating || showBlocksLoadingState) && (
                <SessionLoadingOverlay label={centerLoadingLabel} />
              )}

              <SessionStyleConfirmModal
                open={showStyleConfirmModal}
                selectedStyleOption={selectedStyleOption}
                setSelectedStyleOption={setSelectedStyleOption}
                setAsSessionDefault={setAsSessionDefault}
                onToggleSetAsSessionDefault={() => setSetAsSessionDefault(value => !value)}
                isBusy={isBusy}
                onClose={closeStyleConfirmModal}
                onSubmit={submitStyleConfirmGenerate}
              />
            </div>,
            editorHost,
          )
        : null}
      <CsvExportGuideDialog
        open={Boolean(csvExportGuide)}
        fieldsLine={csvExportGuide?.fieldsLine ?? ''}
        previewText={csvExportGuide?.previewText ?? ''}
        onClose={() => setCsvExportGuide(null)}
        onDownloadCsv={() => {
          if (!csvExportGuide?.csvContent || !csvExportGuide.fileName) return;
          const blob = new Blob([csvExportGuide.csvContent], {
            type: 'text/csv;charset=utf-8;',
          });
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = csvExportGuide.fileName;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          window.URL.revokeObjectURL(url);
          const openMapsUrl = csvExportGuide.openMapsUrl || 'https://www.google.com/maps/d/u/0/';
          toast.success('CSV downloaded.', {
            description: 'Open My Maps with your current route.',
            action: {
              label: 'Open My Maps',
              onClick: () => {
                window.open(openMapsUrl, '_blank', 'noopener,noreferrer');
              },
            },
            actionButtonStyle: {
              background: '#E7F8F4',
              border: '1px solid #8BD9CF',
              color: '#0F766E',
              fontWeight: 600,
            },
          });
        }}
        onOpenMaps={() => {
          const openMapsUrl = csvExportGuide?.openMapsUrl || 'https://www.google.com/maps/d/u/0/';
          window.open(openMapsUrl, '_blank', 'noopener,noreferrer');
        }}
      />
      <DeleteConfirmationDialog
        open={Boolean(pendingDeleteHandbookVersionId)}
        title="Delete Handbook?"
        description={`Delete ${
          (pendingDeleteHandbookVersion?.title || '').trim() || 'this handbook'
        }? This cannot be undone.`}
        confirmLabel="Delete"
        confirmDisabled={isRemovingHandbookVersion}
        onCancel={() => setPendingDeleteHandbookVersionId(null)}
        onConfirm={confirmDeleteHandbookVersion}
      />
      <ConfirmationDialog
        open={isLeaveConfirmOpen}
        title="Unsaved Block Changes"
        description="You have unsaved block edits. Leave this page and discard changes?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        onCancel={cancelLeaveWithUnsavedWarning}
        onConfirm={confirmLeaveWithUnsavedWarning}
      />
    </div>
  );
}
