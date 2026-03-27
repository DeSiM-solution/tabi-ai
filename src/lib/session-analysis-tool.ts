export const SESSION_ANALYSIS_TOOL_NAME = 'analyze_session_data' as const;
export const LEGACY_SESSION_ANALYSIS_TOOL_NAME = 'build_travel_blocks' as const;

export const SESSION_ANALYSIS_TOOL_NAME_ALIASES = [
  SESSION_ANALYSIS_TOOL_NAME,
  LEGACY_SESSION_ANALYSIS_TOOL_NAME,
] as const;

export type SessionAnalysisToolNameAlias =
  (typeof SESSION_ANALYSIS_TOOL_NAME_ALIASES)[number];

export function isSessionAnalysisToolName(value: unknown): value is SessionAnalysisToolNameAlias {
  return (
    typeof value === 'string' &&
    SESSION_ANALYSIS_TOOL_NAME_ALIASES.includes(value as SessionAnalysisToolNameAlias)
  );
}

export function normalizeSessionAnalysisToolName(
  value: string | null | undefined,
): typeof SESSION_ANALYSIS_TOOL_NAME | null {
  if (!value) return null;
  return isSessionAnalysisToolName(value) ? SESSION_ANALYSIS_TOOL_NAME : null;
}
