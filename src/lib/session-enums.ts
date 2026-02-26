export const SESSION_STATUS_VALUES = [
  'IDLE',
  'RUNNING',
  'COMPLETED',
  'ERROR',
  'CANCELLED',
] as const;

export type SessionStatusValue = (typeof SESSION_STATUS_VALUES)[number];

export const SESSION_STATUS: Record<SessionStatusValue, SessionStatusValue> = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED',
};

export const SESSION_STEP_STATUS_VALUES = [
  'RUNNING',
  'SUCCESS',
  'ERROR',
  'CANCELLED',
] as const;

export type SessionStepStatusValue = (typeof SESSION_STEP_STATUS_VALUES)[number];

export const SESSION_STEP_STATUS: Record<
  SessionStepStatusValue,
  SessionStepStatusValue
> = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED',
};

export const SESSION_TOOL_NAME_VALUES = [
  'parse_youtube_input',
  'crawl_youtube_videos',
  'build_travel_blocks',
  'resolve_spot_coordinates',
  'search_image',
  'generate_image',
  'generate_handbook_html',
] as const;

export type SessionToolNameValue = (typeof SESSION_TOOL_NAME_VALUES)[number];

export const HANDBOOK_LIFECYCLE_STATUS_VALUES = [
  'DRAFT',
  'ARCHIVED',
  'PUBLIC',
] as const;

export type HandbookLifecycleStatusValue =
  (typeof HANDBOOK_LIFECYCLE_STATUS_VALUES)[number];

export const HANDBOOK_LIFECYCLE_STATUS: Record<
  HandbookLifecycleStatusValue,
  HandbookLifecycleStatusValue
> = {
  DRAFT: 'DRAFT',
  ARCHIVED: 'ARCHIVED',
  PUBLIC: 'PUBLIC',
};

export const MESSAGE_ROLE_VALUES = [
  'USER',
  'ASSISTANT',
  'SYSTEM',
  'TOOL',
] as const;

export type MessageRoleValue = (typeof MESSAGE_ROLE_VALUES)[number];

export const MESSAGE_ROLE: Record<MessageRoleValue, MessageRoleValue> = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
  TOOL: 'TOOL',
};
