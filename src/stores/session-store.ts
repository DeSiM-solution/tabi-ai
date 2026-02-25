'use client';

import type { UIMessage } from 'ai';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export const SESSION_TOOL_ORDER = [
  'parse_youtube_input',
  'crawl_youtube_videos',
  'build_travel_blocks',
  'resolve_spot_coordinates',
  'search_image',
  'generate_image',
  'generate_handbook_html',
] as const;

export type SessionToolName = (typeof SESSION_TOOL_ORDER)[number];
export type SessionStepStatus = 'idle' | 'loading' | 'success' | 'error';

interface SessionStepProgress {
  status: SessionStepStatus;
  error: string | null;
  output: unknown | null;
}

interface SessionProcessState {
  sessionId: string | null;
  loading: boolean;
  error: string | null;
  stopped: boolean;
  currentStep: SessionToolName | null;
  failedStep: SessionToolName | null;
  completedSteps: SessionToolName[];
  steps: Record<SessionToolName, SessionStepProgress>;
  toolOutputs: Partial<Record<SessionToolName, unknown>>;
  latestUserText: string | null;
  latestAssistantText: string | null;
  lastUpdated: number | null;
}

interface SessionActions {
  setSessionId: (sessionId: string) => void;
  reset: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  markStopped: () => void;
  syncFromMessages: (
    sessionId: string,
    messages: UIMessage[],
    editedToolOutputs: Record<string, unknown>,
    requestLoading: boolean,
  ) => void;
}

type SessionStoreState = SessionProcessState & SessionActions;

type ToolPart = Extract<UIMessage['parts'][number], { type: `tool-${string}` }>;

function createEmptySteps(): Record<SessionToolName, SessionStepProgress> {
  return {
    parse_youtube_input: { status: 'idle', error: null, output: null },
    crawl_youtube_videos: { status: 'idle', error: null, output: null },
    build_travel_blocks: { status: 'idle', error: null, output: null },
    resolve_spot_coordinates: { status: 'idle', error: null, output: null },
    search_image: { status: 'idle', error: null, output: null },
    generate_image: { status: 'idle', error: null, output: null },
    generate_handbook_html: { status: 'idle', error: null, output: null },
  };
}

function createInitialState(): SessionProcessState {
  return {
    sessionId: null,
    loading: false,
    error: null,
    stopped: false,
    currentStep: null,
    failedStep: null,
    completedSteps: [],
    steps: createEmptySteps(),
    toolOutputs: {},
    latestUserText: null,
    latestAssistantText: null,
    lastUpdated: null,
  };
}

function isToolPart(part: UIMessage['parts'][number]): part is ToolPart {
  if (!('type' in part) || typeof part.type !== 'string') return false;
  return part.type.startsWith('tool-');
}

function toToolName(type: string): SessionToolName | null {
  const rawName = type.replace('tool-', '');
  if (!SESSION_TOOL_ORDER.includes(rawName as SessionToolName)) {
    return null;
  }
  return rawName as SessionToolName;
}

function toLatestText(messages: UIMessage[], role: 'user' | 'assistant'): string | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== role) continue;

    const textPart = message.parts.find(part => part.type === 'text' && part.text.trim());
    if (textPart?.type === 'text') {
      return textPart.text;
    }
  }

  return null;
}

const useSessionProcessStore = create<SessionStoreState>(set => ({
  ...createInitialState(),

  setSessionId(sessionId) {
    set(previous => {
      if (previous.sessionId === sessionId) return previous;
      return {
        ...createInitialState(),
        sessionId,
      };
    });
  },

  reset() {
    set(createInitialState());
  },

  setLoading(loading) {
    set(previous => {
      if (previous.loading === loading) return previous;
      return {
        ...previous,
        loading,
      };
    });
  },

  setError(error) {
    set(previous => {
      if (previous.error === error) return previous;
      return {
        ...previous,
        error,
      };
    });
  },

  markStopped() {
    set(previous => ({
      ...previous,
      loading: false,
      error: null,
      stopped: true,
    }));
  },

  syncFromMessages(sessionId, messages, editedToolOutputs, requestLoading) {
    const steps = createEmptySteps();
    const toolOutputs: Partial<Record<SessionToolName, unknown>> = {};

    for (const message of messages) {
      message.parts.forEach((part, partIndex) => {
        if (!isToolPart(part)) return;

        const toolName = toToolName(part.type);
        if (!toolName) return;

        const sourceKey = `${message.id}:${partIndex}:${part.type}`;
        if (part.state === 'output-error') {
          steps[toolName] = {
            status: 'error',
            error: part.errorText || 'Tool execution failed',
            output: null,
          };
          return;
        }

        if (part.state === 'output-available') {
          const output = editedToolOutputs[sourceKey] ?? part.output ?? null;
          steps[toolName] = {
            status: 'success',
            error: null,
            output,
          };
          toolOutputs[toolName] = output;
          return;
        }

        steps[toolName] = {
          status: 'loading',
          error: null,
          output: steps[toolName].output,
        };
      });
    }

    // search_image and generate_image are alternative branches:
    // if one succeeds, treat the other as satisfied for process tracking.
    const imagePrepared =
      steps.search_image.status === 'success' ||
      steps.generate_image.status === 'success';
    if (imagePrepared) {
      if (steps.search_image.status === 'idle' || steps.search_image.status === 'error') {
        steps.search_image = { status: 'success', error: null, output: steps.search_image.output };
      }
      if (
        steps.generate_image.status === 'idle' ||
        steps.generate_image.status === 'error'
      ) {
        steps.generate_image = {
          status: 'success',
          error: null,
          output: steps.generate_image.output,
        };
      }
    }

    const completedSteps = SESSION_TOOL_ORDER.filter(
      step => steps[step].status === 'success',
    );

    const failedStep =
      SESSION_TOOL_ORDER.find(step => steps[step].status === 'error') ?? null;

    const loadingStep =
      SESSION_TOOL_ORDER.find(step => steps[step].status === 'loading') ?? null;

    let currentStep: SessionToolName | null = null;
    if (failedStep) {
      currentStep = failedStep;
    } else if (loadingStep) {
      currentStep = loadingStep;
    } else if (completedSteps.length > 0) {
      currentStep = completedSteps[completedSteps.length - 1];
    } else if (requestLoading) {
      currentStep = SESSION_TOOL_ORDER[0];
    }

    const error = failedStep ? steps[failedStep].error || `${failedStep} failed` : null;
    const computedLoading = failedStep ? false : Boolean(loadingStep) || requestLoading;

    set(previous => ({
      ...previous,
      sessionId,
      loading: previous.stopped && !requestLoading ? false : computedLoading,
      error,
      stopped: requestLoading ? false : previous.stopped && !failedStep,
      currentStep,
      failedStep,
      completedSteps,
      steps,
      toolOutputs,
      latestUserText: toLatestText(messages, 'user'),
      latestAssistantText: toLatestText(messages, 'assistant'),
      lastUpdated: Date.now(),
    }));
  },
}));

export const sessionActions: SessionActions = {
  setSessionId: sessionId => useSessionProcessStore.getState().setSessionId(sessionId),
  reset: () => useSessionProcessStore.getState().reset(),
  setLoading: loading => useSessionProcessStore.getState().setLoading(loading),
  setError: error => useSessionProcessStore.getState().setError(error),
  markStopped: () => useSessionProcessStore.getState().markStopped(),
  syncFromMessages: (sessionId, messages, editedToolOutputs, requestLoading) =>
    useSessionProcessStore
      .getState()
      .syncFromMessages(sessionId, messages, editedToolOutputs, requestLoading),
};

export const sessionStore = {
  getState: useSessionProcessStore.getState,
  subscribe: useSessionProcessStore.subscribe,
  actions: sessionActions,
};

export function useSessionStore<T>(selector: (state: SessionProcessState) => T): T {
  return useSessionProcessStore(useShallow(state => selector(state)));
}

export function formatToolLabel(step: SessionToolName | null): string {
  if (!step) return 'idle';
  if (step === 'parse_youtube_input') return 'Parse URL';
  if (step === 'crawl_youtube_videos') return 'Crawl Video';
  if (step === 'build_travel_blocks') return 'Build Blocks';
  if (step === 'resolve_spot_coordinates') return 'Resolve Coordinates';
  if (step === 'search_image') return 'Search Images';
  if (step === 'generate_image') return 'Generate Images';
  return 'Generate Handbook';
}
