export function toGuidePreviewPath(path: string, fallbackHandbookId: string): string {
  const normalized = path.split('?')[0] ?? path;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const url = new URL(normalized);
      if (url.pathname.startsWith('/api/handbook/')) {
        return `/api/guide/${fallbackHandbookId}`;
      }
      return url.pathname || `/api/guide/${fallbackHandbookId}`;
    } catch {
      return `/api/guide/${fallbackHandbookId}`;
    }
  }
  if (normalized.startsWith('/api/handbook/')) {
    return `/api/guide/${fallbackHandbookId}`;
  }
  return normalized;
}

export function toPreviewAddress(
  previewUrl: string | null,
  fallbackPath: string,
): string {
  if (!previewUrl) return fallbackPath;
  const normalized = previewUrl.split('?')[0] ?? previewUrl;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      return new URL(normalized).pathname || fallbackPath;
    } catch {
      return fallbackPath;
    }
  }
  return normalized || fallbackPath;
}
