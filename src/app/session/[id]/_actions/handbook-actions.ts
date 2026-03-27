import type { RefObject } from 'react';
import type { UIMessage } from 'ai';
import { toast } from 'sonner';

import {
  getHandbookStyleInstruction,
  getHandbookStyleLabel,
  type HandbookStyleId,
} from '@/lib/handbook-style';
import { handbooksActions } from '@/stores/handbooks-store';

import {
  applyEditorSession,
  type EditorSession,
  type UnknownRecord,
} from '../_lib/chat-utils';
import { countGenerateHandbookOutputs } from '../_lib/handbook-generation-utils';
import { compactChatMessagesForChatApi } from '../_lib/message-compact';
import {
  GENERATING_HANDBOOK_PLACEHOLDER_HTML,
  GENERATING_HANDBOOK_TITLE,
  MANUAL_HANDBOOK_PROMPT_PREFIX,
} from '../_lib/session-page-constants';
import { sessionEditorActions } from '../_stores/session-editor-store';

export type PendingGeneratingHandbookVersion = {
  handbookId: string;
  title: string;
  createdAt: string;
  previousActiveHandbookId: string | null;
  persisted: boolean;
};

type GenerateHandbookFromEditorOptions = {
  forcedStyle?: HandbookStyleId;
  persistStyleAsDefault?: boolean;
};

type GenerateHandbookFromEditorArgs = {
  sessionId: string;
  session: EditorSession;
  options?: GenerateHandbookFromEditorOptions;
  isBusy: boolean;
  handbookStyle: HandbookStyleId | null;
  activeHandbookId: string | null;
  messages: UIMessage[];
  requireLogin: (description: string) => boolean;
  persistEditorOutput: (session: EditorSession, output: UnknownRecord) => Promise<boolean>;
  setHandbookStyle: (style: HandbookStyleId | null) => void;
  setMessages: (messages: UIMessage[]) => void;
  sendMessage: (message: { text: string }) => void;
  pendingGeneratingHandbookVersionRef: RefObject<PendingGeneratingHandbookVersion | null>;
  setPendingGeneratingHandbookVersion: (next: PendingGeneratingHandbookVersion | null) => void;
  setIsGeneratingNewHandbook: (next: boolean) => void;
  resetHtmlPreviewLoadPhase: () => void;
  pendingToolbarGenerationRef: RefObject<{ beforeCount: number } | null>;
};

export async function generateHandbookFromEditor({
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
}: GenerateHandbookFromEditorArgs): Promise<void> {
  if (!requireLogin('Handbook remix requires an account login.')) return;
  if (!sessionId) return;
  if (isBusy) return;

  const nextOutput = applyEditorSession(session);
  const blocks = Array.isArray(nextOutput.blocks) ? nextOutput.blocks : [];
  if (blocks.length === 0) {
    alert('Please add at least one block before remixing the handbook.');
    return;
  }

  const styleId = options?.forcedStyle ?? handbookStyle ?? 'let-tabi-decide';
  if (options?.persistStyleAsDefault) {
    setHandbookStyle(styleId);
  }
  const styleLabel = getHandbookStyleLabel(styleId);
  const styleInstruction = getHandbookStyleInstruction(styleId);

  sessionEditorActions.upsertEditedToolOutput(
    sessionId,
    session.sourceKey,
    nextOutput,
  );
  const synced = await persistEditorOutput(session, nextOutput);
  if (!synced) {
    toast.error('Failed to sync session data before remixing the handbook.');
    return;
  }

  const compactedMessages = compactChatMessagesForChatApi(messages);
  const shouldDelaySendAfterCompaction = compactedMessages !== messages;
  if (shouldDelaySendAfterCompaction) {
    setMessages(compactedMessages);
  }

  let persistedPendingHandbookId: string | null = null;
  try {
    const placeholderHandbook = await handbooksActions.createHandbook(sessionId, {
      title: GENERATING_HANDBOOK_TITLE,
      html: GENERATING_HANDBOOK_PLACEHOLDER_HTML,
      lifecycle: 'DRAFT',
      previewPath: null,
      sourceContext: {
        handbookGenerationStatus: 'pending',
        generationKind: 'remix',
      },
      style: styleId,
      thumbnailUrl: session.thumbnailUrl ?? null,
      setActive: true,
    });
    persistedPendingHandbookId = placeholderHandbook?.id ?? null;
  } catch (error) {
    console.error('[chat-ui] create-generating-placeholder-failed', error);
    toast.error('Failed to prepare the remix draft.');
    return;
  }
  if (!persistedPendingHandbookId) {
    toast.error('Failed to prepare the remix draft.');
    return;
  }

  const nextPendingVersion: PendingGeneratingHandbookVersion = {
    handbookId: persistedPendingHandbookId,
    title: GENERATING_HANDBOOK_TITLE,
    createdAt: new Date().toISOString(),
    previousActiveHandbookId: activeHandbookId ?? null,
    persisted: true,
  };
  const previousPendingVersion = pendingGeneratingHandbookVersionRef.current;
  if (previousPendingVersion) {
    sessionEditorActions.removeHandbookState(sessionId, previousPendingVersion.handbookId);
    if (previousPendingVersion.persisted) {
      void handbooksActions.removeHandbook(
        sessionId,
        previousPendingVersion.handbookId,
      ).catch(error => {
        console.error('[chat-ui] remove-previous-pending-handbook-failed', error);
      });
    }
  }
  pendingGeneratingHandbookVersionRef.current = nextPendingVersion;
  setPendingGeneratingHandbookVersion(nextPendingVersion);
  setIsGeneratingNewHandbook(true);
  resetHtmlPreviewLoadPhase();
  sessionEditorActions.setHandbookHtml(sessionId, null, nextPendingVersion.handbookId);
  sessionEditorActions.setHandbookPreviewUrl(sessionId, null, nextPendingVersion.handbookId);
  sessionEditorActions.setHandbookStatus(
    sessionId,
    'generating',
    nextPendingVersion.handbookId,
  );
  sessionEditorActions.setHandbookError(sessionId, null, nextPendingVersion.handbookId);
  sessionEditorActions.setActiveHandbookId(sessionId, nextPendingVersion.handbookId);
  sessionEditorActions.setCenterViewMode(sessionId, 'html');

  const handbookInputOverrides = {
    handbookId: nextPendingVersion.handbookId,
    title: session.title,
    videoId: session.videoId,
    videoUrl: session.videoUrl,
    thumbnailUrl: session.thumbnailUrl,
    handbookStyle: styleId,
  };
  const prompt = [
    MANUAL_HANDBOOK_PROMPT_PREFIX,
    'Create a brand-new handbook artifact for this remix.',
    'Use the latest session state as handbook input (blocks/spot_blocks/tool_outputs).',
    'Do not inline blocks/images in tool input.',
    'If prepared images are missing, call exactly one image tool first, then generate_handbook_html once.',
    'Do not call parse_youtube_input, crawl_youtube_videos, analyze_session_data, build_travel_blocks, or resolve_spot_coordinates.',
    `Use handbook style: ${styleLabel}.`,
    styleInstruction
      ? `Style direction: ${styleInstruction}`
      : 'If style is "Let Tabi decide", choose the most fitting visual style from the content.',
    'HANDBOOK_INPUT_JSON:',
    JSON.stringify(handbookInputOverrides),
  ].join('\n');
  pendingToolbarGenerationRef.current = {
    beforeCount: countGenerateHandbookOutputs(compactedMessages),
  };
  if (shouldDelaySendAfterCompaction) {
    window.setTimeout(() => {
      sendMessage({ text: prompt });
    }, 0);
    return;
  }
  sendMessage({ text: prompt });
}
