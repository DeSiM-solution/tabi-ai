function normalizeStyleTokenList(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .filter(token => token.toLowerCase() !== 'none');
}

export function toggleHandbookFontWeightValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'bold') return '';
  const numericWeight = Number(normalized);
  if (Number.isFinite(numericWeight) && numericWeight >= 600) {
    return '';
  }
  return '700';
}

export function toggleHandbookFontStyleValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'italic' || normalized === 'oblique') {
    return '';
  }
  return 'italic';
}

export function toggleHandbookTextDecorationValue(
  value: string,
  token: 'underline' | 'line-through',
): string {
  const tokens = normalizeStyleTokenList(value);
  const nextTokens = tokens.includes(token)
    ? tokens.filter(existingToken => existingToken !== token)
    : [...tokens, token];
  return nextTokens.join(' ');
}
