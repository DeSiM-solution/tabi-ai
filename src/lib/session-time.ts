function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatSessionDateTime(value: Date | number): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = padTwo(date.getHours());
  const minutes = padTwo(date.getMinutes());
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

export function resolveSessionTimeValue(
  startedAt: Date | number | null | undefined,
  createdAt: Date | number | null | undefined,
): Date | number | null {
  return startedAt ?? createdAt ?? null;
}
