import {
  HANDBOOK_REMIX_PROMPT_PREFIX,
  LEGACY_HANDBOOK_REGEN_PROMPT_PREFIX,
} from '@/lib/handbook-remix';

export const PERSISTABLE_BLOCK_TOOL_NAMES = new Set([
  'analyze_session_data',
  'build_travel_blocks',
  'resolve_spot_coordinates',
]);

export const MANUAL_HANDBOOK_PROMPT_PREFIX = HANDBOOK_REMIX_PROMPT_PREFIX;

export const LEGACY_MANUAL_HANDBOOK_PROMPT_PREFIX =
  LEGACY_HANDBOOK_REGEN_PROMPT_PREFIX;

export const LEGACY_HANDBOOK_INPUT_JSON_MARKER = 'HANDBOOK_INPUT_JSON:';

export const GENERATING_HANDBOOK_TITLE = 'Generating Handbook...';

export const GENERATING_HANDBOOK_PLACEHOLDER_HTML = [
  '<!doctype html>',
  '<html lang="en">',
  '<head><meta charset="utf-8"><title>Generating Handbook</title></head>',
  '<body><main><p>Generating Handbook...</p></main></body>',
  '</html>',
].join('');
