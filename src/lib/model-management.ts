import { deepseek } from '@ai-sdk/deepseek';
import { google } from '@ai-sdk/google';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

type Provider = 'deepseek' | 'google';

export type StabilityTier = 'stable' | 'preview';
export type ValidationPolicy =
  | 'none'
  | 'schema_only'
  | 'schema_and_business_rules';

export type ModelTask =
  | 'chat_orchestration'
  | 'conversation_compaction'
  | 'session_description_summary'
  | 'json_compilation_strict'
  | 'spot_query_normalization'
  | 'handbook_image_query_planning'
  | 'handbook_html_generation';

export type TaskName = ModelTask | 'html_rendering';

export interface TaskPolicy {
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  validationPolicy: ValidationPolicy;
  stabilityTier: StabilityTier;
}

export interface ModelCandidate {
  provider: Provider;
  modelId: string;
  label: string;
  stabilityTier: StabilityTier;
}

interface ModelTaskRoute {
  primary: ModelCandidate;
  fallback?: ModelCandidate;
  policy: TaskPolicy;
}

type ModelInstance = ReturnType<typeof deepseek> | ReturnType<typeof google>;

export interface ResolvedModelCandidate extends ModelCandidate {
  model: ModelInstance;
}

export interface ResolvedModelTask {
  task: ModelTask;
  primary: ResolvedModelCandidate;
  fallback?: ResolvedModelCandidate;
  policy: TaskPolicy;
}

export interface HtmlRenderingTask {
  task: 'html_rendering';
  mode: 'local_jsx_renderer';
  policy: TaskPolicy;
}

export type TaskSettings = ResolvedModelTask | HtmlRenderingTask;

function getPositiveIntEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const MODEL_TASK_ROUTES: Record<ModelTask, ModelTaskRoute> = {
  chat_orchestration: {
    primary: {
      provider: 'deepseek',
      modelId: process.env.CHAT_ORCHESTRATION_MODEL ?? 'deepseek-chat',
      label: 'DeepSeek Chat',
      stabilityTier: 'stable',
    },
    fallback: {
      provider: 'deepseek',
      modelId:
        process.env.CHAT_ORCHESTRATION_FALLBACK_MODEL ?? 'deepseek-reasoner',
      label: 'DeepSeek Reasoner',
      stabilityTier: 'stable',
    },
    policy: {
      maxOutputTokens: getPositiveIntEnv(
        process.env.CHAT_ORCHESTRATION_MAX_OUTPUT_TOKENS,
        getPositiveIntEnv(process.env.DEEPSEEK_CHAT_MAX_OUTPUT_TOKENS, 4_096),
      ),
      timeoutMs: getPositiveIntEnv(
        process.env.CHAT_ORCHESTRATION_TIMEOUT_MS,
        45_000,
      ),
      maxRetries: getPositiveIntEnv(
        process.env.CHAT_ORCHESTRATION_MAX_RETRIES,
        1,
      ),
      validationPolicy: 'none',
      stabilityTier: 'stable',
    },
  },
  conversation_compaction: {
    primary: {
      provider: 'google',
      modelId: process.env.CONVERSATION_COMPACTION_MODEL ?? 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      stabilityTier: 'stable',
    },
    fallback: {
      provider: 'google',
      modelId:
        process.env.CONVERSATION_COMPACTION_FALLBACK_MODEL ?? 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash Lite',
      stabilityTier: 'stable',
    },
    policy: {
      maxOutputTokens: getPositiveIntEnv(
        process.env.CONVERSATION_COMPACTION_MAX_OUTPUT_TOKENS,
        1_200,
      ),
      timeoutMs: getPositiveIntEnv(
        process.env.CONVERSATION_COMPACTION_TIMEOUT_MS,
        25_000,
      ),
      maxRetries: getPositiveIntEnv(
        process.env.CONVERSATION_COMPACTION_MAX_RETRIES,
        1,
      ),
      validationPolicy: 'none',
      stabilityTier: 'stable',
    },
  },
  session_description_summary: {
    primary: {
      provider: 'google',
      modelId: process.env.SESSION_DESCRIPTION_SUMMARY_MODEL ?? 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      stabilityTier: 'stable',
    },
    fallback: {
      provider: 'google',
      modelId:
        process.env.SESSION_DESCRIPTION_SUMMARY_FALLBACK_MODEL ?? 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash Lite',
      stabilityTier: 'stable',
    },
    policy: {
      maxOutputTokens: getPositiveIntEnv(
        process.env.SESSION_DESCRIPTION_SUMMARY_MAX_OUTPUT_TOKENS,
        180,
      ),
      timeoutMs: getPositiveIntEnv(
        process.env.SESSION_DESCRIPTION_SUMMARY_TIMEOUT_MS,
        20_000,
      ),
      maxRetries: getPositiveIntEnv(
        process.env.SESSION_DESCRIPTION_SUMMARY_MAX_RETRIES,
        1,
      ),
      validationPolicy: 'none',
      stabilityTier: 'stable',
    },
  },
  json_compilation_strict: {
    primary: {
      provider: 'google',
      modelId: process.env.JSON_COMPILATION_MODEL ?? 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      stabilityTier: 'stable',
    },
    fallback: {
      provider: 'google',
      modelId:
        process.env.JSON_COMPILATION_FALLBACK_MODEL ?? 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      stabilityTier: 'stable',
    },
    policy: {
      maxOutputTokens: getPositiveIntEnv(
        process.env.JSON_COMPILATION_MAX_OUTPUT_TOKENS,
        8_192,
      ),
      timeoutMs: getPositiveIntEnv(
        process.env.JSON_COMPILATION_TIMEOUT_MS,
        60_000,
      ),
      maxRetries: getPositiveIntEnv(
        process.env.JSON_COMPILATION_MAX_RETRIES,
        2,
      ),
      validationPolicy: 'schema_and_business_rules',
      stabilityTier: 'stable',
    },
  },
  spot_query_normalization: {
    primary: {
      provider: 'google',
      modelId: process.env.SPOT_QUERY_MODEL ?? 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      stabilityTier: 'stable',
    },
    fallback: {
      provider: 'google',
      modelId: process.env.SPOT_QUERY_FALLBACK_MODEL ?? 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash Lite',
      stabilityTier: 'stable',
    },
    policy: {
      maxOutputTokens: getPositiveIntEnv(
        process.env.SPOT_QUERY_MAX_OUTPUT_TOKENS,
        4_096,
      ),
      timeoutMs: getPositiveIntEnv(process.env.SPOT_QUERY_TIMEOUT_MS, 30_000),
      maxRetries: getPositiveIntEnv(process.env.SPOT_QUERY_MAX_RETRIES, 2),
      validationPolicy: 'schema_and_business_rules',
      stabilityTier: 'stable',
    },
  },
  handbook_image_query_planning: {
    primary: {
      provider: 'google',
      modelId:
        process.env.HANDBOOK_IMAGE_QUERY_MODEL ?? 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      stabilityTier: 'stable',
    },
    fallback: {
      provider: 'google',
      modelId:
        process.env.HANDBOOK_IMAGE_QUERY_FALLBACK_MODEL ??
        'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash Lite',
      stabilityTier: 'stable',
    },
    policy: {
      maxOutputTokens: getPositiveIntEnv(
        process.env.HANDBOOK_IMAGE_QUERY_MAX_OUTPUT_TOKENS,
        4_096,
      ),
      timeoutMs: getPositiveIntEnv(
        process.env.HANDBOOK_IMAGE_QUERY_TIMEOUT_MS,
        35_000,
      ),
      maxRetries: getPositiveIntEnv(
        process.env.HANDBOOK_IMAGE_QUERY_MAX_RETRIES,
        2,
      ),
      validationPolicy: 'schema_and_business_rules',
      stabilityTier: 'stable',
    },
  },
  handbook_html_generation: {
    primary: {
      provider: 'google',
      modelId: process.env.HANDBOOK_HTML_MODEL ?? 'gemini-3-pro-preview',
      label: 'Gemini 3 Pro Preview',
      stabilityTier: 'preview',
    },
    fallback: {
      provider: 'google',
      modelId: process.env.HANDBOOK_HTML_FALLBACK_MODEL ?? 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      stabilityTier: 'stable',
    },
    policy: {
      maxOutputTokens: getPositiveIntEnv(
        process.env.HANDBOOK_HTML_MAX_OUTPUT_TOKENS,
        16_384,
      ),
      timeoutMs: getPositiveIntEnv(process.env.HANDBOOK_HTML_TIMEOUT_MS, 75_000),
      maxRetries: getPositiveIntEnv(process.env.HANDBOOK_HTML_MAX_RETRIES, 1),
      validationPolicy: 'none',
      stabilityTier: 'preview',
    },
  },
};

const HTML_RENDERING_TASK: HtmlRenderingTask = {
  task: 'html_rendering',
  mode: 'local_jsx_renderer',
  policy: {
    maxOutputTokens: 0,
    timeoutMs: 0,
    maxRetries: 0,
    validationPolicy: 'none',
    stabilityTier: 'stable',
  },
};

function createModel(candidate: ModelCandidate): ModelInstance {
  if (candidate.provider === 'deepseek') {
    return deepseek(candidate.modelId);
  }
  return google(candidate.modelId);
}

function resolveCandidate(candidate: ModelCandidate): ResolvedModelCandidate {
  return {
    ...candidate,
    model: createModel(candidate),
  };
}

export function resolveModelTask(task: ModelTask): ResolvedModelTask {
  const route = MODEL_TASK_ROUTES[task];
  return {
    task,
    primary: resolveCandidate(route.primary),
    fallback: route.fallback ? resolveCandidate(route.fallback) : undefined,
    policy: route.policy,
  };
}

export function getTaskSettings(task: TaskName): TaskSettings {
  if (task === 'html_rendering') {
    return HTML_RENDERING_TASK;
  }
  return resolveModelTask(task);
}

function toErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function withValidationFeedback(prompt: string, errors: string[]): string {
  if (errors.length === 0) {
    return prompt;
  }

  return [
    prompt,
    '',
    'The previous JSON failed local validation. Regenerate the full JSON and fix all issues below:',
    ...errors.map((error, index) => `${index + 1}. ${error}`),
    'Do not output prose. Return strict JSON only.',
  ].join('\n');
}

export interface StructuredTaskOptions<Schema extends z.ZodTypeAny> {
  task: Extract<
    ModelTask,
    | 'json_compilation_strict'
    | 'spot_query_normalization'
    | 'handbook_image_query_planning'
  >;
  schema: Schema;
  prompt: string;
  validateBusinessRules?: (value: z.infer<Schema>) => string[];
  abortSignal?: AbortSignal;
}

export interface StructuredTaskResult<Schema extends z.ZodTypeAny> {
  object: z.infer<Schema>;
  model: ModelCandidate;
  attempts: number;
}

export interface TextTaskOptions {
  task: Extract<
    ModelTask,
    | 'handbook_html_generation'
    | 'conversation_compaction'
    | 'session_description_summary'
  >;
  prompt: string;
  system?: string;
  abortSignal?: AbortSignal;
}

export interface TextTaskResult {
  text: string;
  model: ModelCandidate;
  attempts: number;
}

const MAX_VALIDATION_ERRORS = 12;

function toPublicCandidate(candidate: ResolvedModelCandidate): ModelCandidate {
  return {
    provider: candidate.provider,
    modelId: candidate.modelId,
    label: candidate.label,
    stabilityTier: candidate.stabilityTier,
  };
}

export async function runStructuredTask<Schema extends z.ZodTypeAny>(
  options: StructuredTaskOptions<Schema>,
): Promise<StructuredTaskResult<Schema>> {
  const taskConfig = resolveModelTask(options.task);
  const candidates = [
    taskConfig.primary,
    ...(taskConfig.fallback ? [taskConfig.fallback] : []),
  ];

  let totalAttempts = 0;
  let lastError: unknown;

  for (const [candidateIndex, candidate] of candidates.entries()) {
    let validationErrors: string[] = [];

    for (
      let retryIndex = 0;
      retryIndex <= taskConfig.policy.maxRetries;
      retryIndex += 1
    ) {
      totalAttempts += 1;
      console.log('[model-management] structured-task-attempt', {
        task: options.task,
        provider: candidate.provider,
        modelId: candidate.modelId,
        attemptOnModel: retryIndex + 1,
        totalAttempts,
        maxRetriesPerModel: taskConfig.policy.maxRetries,
      });

      try {
        const result = await generateObject({
          model: candidate.model,
          schema: options.schema,
          prompt: withValidationFeedback(options.prompt, validationErrors),
          maxOutputTokens: taskConfig.policy.maxOutputTokens,
          timeout: taskConfig.policy.timeoutMs,
          abortSignal: options.abortSignal,
          maxRetries: 0,
        });
        const typedObject = result.object as z.infer<Schema>;

        if (
          taskConfig.policy.validationPolicy ===
            'schema_and_business_rules' &&
          options.validateBusinessRules
        ) {
          const businessErrors = options.validateBusinessRules(typedObject);
          if (businessErrors.length > 0) {
            validationErrors = businessErrors.slice(0, MAX_VALIDATION_ERRORS);
            console.warn('[model-management] business-validation-failed', {
              task: options.task,
              provider: candidate.provider,
              modelId: candidate.modelId,
              attemptOnModel: retryIndex + 1,
              errors: validationErrors,
            });
            lastError = new Error(
              `Business validation failed: ${validationErrors.join(' | ')}`,
            );
            if (retryIndex < taskConfig.policy.maxRetries) {
              continue;
            }
            break;
          }
        }

        console.log('[model-management] structured-task-success', {
          task: options.task,
          provider: candidate.provider,
          modelId: candidate.modelId,
          totalAttempts,
        });
        return {
          object: typedObject,
          model: toPublicCandidate(candidate),
          attempts: totalAttempts,
        };
      } catch (error) {
        lastError = error;
        validationErrors = [];
        console.warn('[model-management] structured-task-attempt-failed', {
          task: options.task,
          provider: candidate.provider,
          modelId: candidate.modelId,
          attemptOnModel: retryIndex + 1,
          message: toErrorMessage(error),
        });
        if (retryIndex < taskConfig.policy.maxRetries) {
          continue;
        }
      }
    }
    if (candidateIndex < candidates.length - 1) {
      console.warn('[model-management] switch-to-fallback-model', {
        task: options.task,
        failedModel: `${candidate.provider}:${candidate.modelId}`,
        nextModel: `${candidates[candidateIndex + 1].provider}:${candidates[candidateIndex + 1].modelId}`,
      });
    }
  }

  throw new Error(
    `Task "${options.task}" failed after ${totalAttempts} attempt(s): ${toErrorMessage(lastError)}`,
  );
}

export async function runTextTask(
  options: TextTaskOptions,
): Promise<TextTaskResult> {
  const taskConfig = resolveModelTask(options.task);
  const candidates = [
    taskConfig.primary,
    ...(taskConfig.fallback ? [taskConfig.fallback] : []),
  ];

  let totalAttempts = 0;
  let lastError: unknown;

  for (const [candidateIndex, candidate] of candidates.entries()) {
    for (
      let retryIndex = 0;
      retryIndex <= taskConfig.policy.maxRetries;
      retryIndex += 1
    ) {
      totalAttempts += 1;
      console.log('[model-management] text-task-attempt', {
        task: options.task,
        provider: candidate.provider,
        modelId: candidate.modelId,
        attemptOnModel: retryIndex + 1,
        totalAttempts,
        maxRetriesPerModel: taskConfig.policy.maxRetries,
      });

      try {
        const result = await generateText({
          model: candidate.model,
          system: options.system,
          prompt: options.prompt,
          maxOutputTokens: taskConfig.policy.maxOutputTokens,
          timeout: taskConfig.policy.timeoutMs,
          abortSignal: options.abortSignal,
          maxRetries: 0,
        });

        console.log('[model-management] text-task-success', {
          task: options.task,
          provider: candidate.provider,
          modelId: candidate.modelId,
          totalAttempts,
          textLength: result.text.length,
        });
        return {
          text: result.text,
          model: toPublicCandidate(candidate),
          attempts: totalAttempts,
        };
      } catch (error) {
        lastError = error;
        console.warn('[model-management] text-task-attempt-failed', {
          task: options.task,
          provider: candidate.provider,
          modelId: candidate.modelId,
          attemptOnModel: retryIndex + 1,
          message: toErrorMessage(error),
        });
        if (retryIndex < taskConfig.policy.maxRetries) {
          continue;
        }
      }
    }

    if (candidateIndex < candidates.length - 1) {
      console.warn('[model-management] switch-to-fallback-model', {
        task: options.task,
        failedModel: `${candidate.provider}:${candidate.modelId}`,
        nextModel: `${candidates[candidateIndex + 1].provider}:${candidates[candidateIndex + 1].modelId}`,
      });
    }
  }

  throw new Error(
    `Task "${options.task}" failed after ${totalAttempts} attempt(s): ${toErrorMessage(lastError)}`,
  );
}
