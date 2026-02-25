import {
  USER_ID_COOKIE_NAME,
  USER_ID_HEADER_NAME,
} from '@/lib/user-identity';

function normalizeUserId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 128);
}

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookieParts = cookieHeader.split(';');
  for (const part of cookieParts) {
    const [rawName, ...rawValueParts] = part.trim().split('=');
    if (!rawName || rawName !== name) continue;
    const rawValue = rawValueParts.join('=');
    if (!rawValue) return null;

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export function resolveRequestUserId(req: Request): string | null {
  const userIdFromHeader = normalizeUserId(req.headers.get(USER_ID_HEADER_NAME));
  if (userIdFromHeader) return userIdFromHeader;
  return normalizeUserId(readCookie(req, USER_ID_COOKIE_NAME));
}

export function getRequestUserId(req: Request): string {
  const userId = resolveRequestUserId(req);
  if (!userId) {
    throw new Error('Missing user id in request headers.');
  }
  return userId;
}
