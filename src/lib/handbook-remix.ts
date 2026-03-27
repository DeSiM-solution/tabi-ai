export const LEGACY_HANDBOOK_REGEN_PROMPT_PREFIX =
  'Generate handbook HTML from edited blocks.';

export const HANDBOOK_REMIX_PROMPT_PREFIX =
  'Remix a new handbook from the latest saved session data.';

export function isHandbookRemixPromptText(
  value: string | null | undefined,
): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return false;

  return (
    trimmed.startsWith(HANDBOOK_REMIX_PROMPT_PREFIX)
    || trimmed.startsWith(LEGACY_HANDBOOK_REGEN_PROMPT_PREFIX)
  );
}

export function getHandbookRemixPromptVariant(
  value: string | null | undefined,
): 'remix' | 'legacy-remix' | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return null;
  if (trimmed.startsWith(HANDBOOK_REMIX_PROMPT_PREFIX)) return 'remix';
  if (trimmed.startsWith(LEGACY_HANDBOOK_REGEN_PROMPT_PREFIX)) return 'legacy-remix';
  return null;
}
