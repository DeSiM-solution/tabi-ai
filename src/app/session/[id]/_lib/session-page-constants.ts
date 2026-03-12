export const PERSISTABLE_BLOCK_TOOL_NAMES = new Set([
  'build_travel_blocks',
  'resolve_spot_coordinates',
]);

export const MANUAL_HANDBOOK_PROMPT_PREFIX =
  'Generate handbook HTML from edited blocks.';

export const LEGACY_HANDBOOK_INPUT_JSON_MARKER = 'HANDBOOK_INPUT_JSON:';

export const GENERATING_HANDBOOK_TITLE = 'Generating Handbook...';

export const GENERATING_HANDBOOK_PLACEHOLDER_HTML = [
  '<!doctype html>',
  '<html lang="en">',
  '<head><meta charset="utf-8"><title>Generating Handbook</title></head>',
  '<body><main><p>Generating Handbook...</p></main></body>',
  '</html>',
].join('');
