interface SessionDescriptionSummaryPromptInput {
  videoTitle: string;
  videoUrl: string;
  location: string | null;
  hashtags: string[];
  sourceText: string;
  maxChars?: number;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function buildSessionDescriptionSummaryPrompt(
  input: SessionDescriptionSummaryPromptInput,
): string {
  const maxCharsCandidate = typeof input.maxChars === 'number' ? input.maxChars : NaN;
  const maxChars =
    Number.isFinite(maxCharsCandidate) && maxCharsCandidate > 0
      ? Math.floor(maxCharsCandidate)
      : 170;
  const cleanedSource = compactWhitespace(input.sourceText);

  return [
    'Write a concise session description for a travel-guide generation session.',
    'Output exactly one sentence in plain English.',
    `Hard limit: ${maxChars} characters.`,
    'Do not include URLs, timestamps, promo codes, affiliate disclaimers, or hashtags.',
    'Focus on destination + core itinerary highlights + traveler value.',
    'Return the sentence only. No quotes, no markdown.',
    '',
    `VIDEO_TITLE: ${truncate(compactWhitespace(input.videoTitle), 220)}`,
    `VIDEO_URL: ${input.videoUrl}`,
    `LOCATION_HINT: ${input.location ?? 'Unknown'}`,
    `HASHTAGS: ${input.hashtags.join(', ') || '(none)'}`,
    '',
    'VIDEO_TEXT_SOURCE:',
    truncate(cleanedSource, 10_000),
  ].join('\n');
}
