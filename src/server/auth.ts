import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma } from '@prisma/client';
import db from '@/lib/db';

const MAX_USERNAME_LENGTH = 24;
const MIN_USERNAME_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const USERNAME_PATTERN = /^[\p{L}\p{N}_-]+$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_LENGTH = 64;

const authUserSelect = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  image: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

type AuthUserModel = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;
type OAuthProvider = 'google' | 'github';

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthValidationError';
  }
}

export interface AuthUserDto {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  image: string | null;
  isGuest: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
}

function toAuthUserDto(user: AuthUserModel): AuthUserDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    image: user.image,
    isGuest: !user.username && !user.email,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

export function normalizeUsername(input: string): string {
  const trimmed = input.trim();
  const length = [...trimmed].length;

  if (length < MIN_USERNAME_LENGTH || length > MAX_USERNAME_LENGTH) {
    throw new AuthValidationError(
      `Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} characters.`,
    );
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new AuthValidationError(
      'Username can only contain letters, numbers, underscores, and hyphens.',
    );
  }

  return trimmed.toLocaleLowerCase();
}

function normalizeOptionalEmail(input?: string | null): string | null {
  if (input === undefined || input === null) return null;
  const trimmed = input.trim().toLocaleLowerCase();
  if (!trimmed) return null;
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new AuthValidationError('Invalid email format.');
  }
  return trimmed;
}

function normalizeOptionalImage(input?: string | null): string | null {
  if (input === undefined || input === null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeOptionalDisplayName(input?: string | null): string | null {
  if (input === undefined || input === null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 64);
}

function validatePassword(input: string): string {
  const value = input.trim();
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw new AuthValidationError(
      `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
  return value;
}

function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString('hex');
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
  return `${PASSWORD_HASH_PREFIX}:${salt}:${hash}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [prefix, salt, hashHex] = encoded.split(':');
  if (!prefix || !salt || !hashHex) return false;
  if (prefix !== PASSWORD_HASH_PREFIX) return false;

  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function sanitizeUsernameSource(input: string): string {
  return input
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_USERNAME_LENGTH);
}

function buildUsernameSeed(
  email: string | null,
  displayName: string | null,
): string {
  const fromEmail = email ? sanitizeUsernameSource(email.split('@')[0] ?? '') : '';
  if (fromEmail.length >= MIN_USERNAME_LENGTH) return fromEmail;

  const fromName = displayName ? sanitizeUsernameSource(displayName) : '';
  if (fromName.length >= MIN_USERNAME_LENGTH) return fromName;

  return 'traveler';
}

async function allocateUniqueUsername(seed: string): Promise<string> {
  const normalizedSeed = sanitizeUsernameSource(seed) || 'traveler';

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const suffix =
      attempt === 0 ? '' : `-${Math.random().toString(36).slice(2, 2 + Math.min(6, attempt + 2))}`;
    const raw = `${normalizedSeed}${suffix}`.slice(0, MAX_USERNAME_LENGTH);
    const candidate =
      raw.length >= MIN_USERNAME_LENGTH
        ? raw
        : `u${Math.random().toString(36).slice(2, 2 + MIN_USERNAME_LENGTH)}`;

    const existing = await db.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });

    if (!existing) return candidate;
  }

  return `u${randomBytes(6).toString('hex').slice(0, 10)}`;
}

async function findUserById(userId: string): Promise<AuthUserModel | null> {
  return db.user.findUnique({
    where: { id: userId },
    select: authUserSelect,
  });
}

async function touchUserLogin(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}

function toOAuthLinkData(provider: OAuthProvider, providerAccountId: string) {
  if (provider === 'google') {
    return { googleId: providerAccountId } as const;
  }
  return { githubId: providerAccountId } as const;
}

function toOAuthWhere(provider: OAuthProvider, providerAccountId: string): Prisma.UserWhereInput {
  if (provider === 'google') {
    return { googleId: providerAccountId };
  }
  return { githubId: providerAccountId };
}

export async function getCurrentAuthUser(userId: string): Promise<AuthUserDto> {
  const user = await findUserById(userId);

  if (!user) {
    return {
      id: userId,
      username: null,
      email: null,
      displayName: null,
      image: null,
      isGuest: true,
      createdAt: null,
      lastLoginAt: null,
    };
  }

  return toAuthUserDto(user);
}

export async function registerWithPassword(input: {
  username: string;
  email?: string | null;
  password: string;
  displayName?: string | null;
}): Promise<AuthUserDto> {
  const username = normalizeUsername(input.username);
  const email = normalizeOptionalEmail(input.email ?? null);
  const displayName = normalizeOptionalDisplayName(input.displayName ?? null);
  const password = validatePassword(input.password);
  const passwordHash = hashPassword(password);
  const now = new Date();

  try {
    const created = await db.user.create({
      data: {
        id: randomUUID(),
        username,
        email,
        displayName: displayName ?? username,
        passwordHash,
        lastLoginAt: now,
      },
      select: authUserSelect,
    });

    return toAuthUserDto(created);
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingByUsername = await db.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (existingByUsername) {
      throw new AuthValidationError('Username is already taken.');
    }

    if (email) {
      const existingByEmail = await db.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingByEmail) {
        throw new AuthValidationError('Email is already registered.');
      }
    }

    throw new AuthValidationError('Unable to register with this account information.');
  }
}

export async function loginWithPassword(input: {
  identifier: string;
  password: string;
}): Promise<AuthUserDto | null> {
  const identifier = input.identifier.trim();
  const password = input.password;

  if (!identifier) {
    throw new AuthValidationError('Username or email is required.');
  }
  if (!password) {
    throw new AuthValidationError('Password is required.');
  }

  const normalizedIdentifier = identifier.toLocaleLowerCase();
  const isEmailIdentifier = normalizedIdentifier.includes('@');

  const user = await db.user.findFirst({
    where: isEmailIdentifier
      ? { email: normalizedIdentifier }
      : { username: normalizedIdentifier },
    select: {
      ...authUserSelect,
      passwordHash: true,
    },
  });

  if (!user?.passwordHash) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;

  await touchUserLogin(user.id);

  const refreshed = await findUserById(user.id);
  return refreshed ? toAuthUserDto(refreshed) : null;
}

export async function resolveOAuthUser(input: {
  provider: OAuthProvider;
  providerAccountId: string;
  email?: string | null;
  displayName?: string | null;
  image?: string | null;
}): Promise<AuthUserDto> {
  const provider = input.provider;
  const providerAccountId = input.providerAccountId.trim();
  const email = normalizeOptionalEmail(input.email ?? null);
  const displayName = normalizeOptionalDisplayName(input.displayName ?? null);
  const image = normalizeOptionalImage(input.image ?? null);

  if (!providerAccountId) {
    throw new AuthValidationError('Missing OAuth provider account id.');
  }

  const existingByProvider = await db.user.findFirst({
    where: toOAuthWhere(provider, providerAccountId),
    select: authUserSelect,
  });

  if (existingByProvider) {
    const updated = await db.user.update({
      where: { id: existingByProvider.id },
      data: {
        email: email ?? existingByProvider.email,
        displayName: displayName ?? existingByProvider.displayName,
        image: image ?? existingByProvider.image,
        lastLoginAt: new Date(),
      },
      select: authUserSelect,
    });
    return toAuthUserDto(updated);
  }

  if (email) {
    const existingByEmail = await db.user.findUnique({
      where: { email },
      select: authUserSelect,
    });

    if (existingByEmail) {
      const updated = await db.user.update({
        where: { id: existingByEmail.id },
        data: {
          ...toOAuthLinkData(provider, providerAccountId),
          displayName: displayName ?? existingByEmail.displayName,
          image: image ?? existingByEmail.image,
          lastLoginAt: new Date(),
        },
        select: authUserSelect,
      });
      return toAuthUserDto(updated);
    }
  }

  const username = await allocateUniqueUsername(buildUsernameSeed(email, displayName));

  try {
    const created = await db.user.create({
      data: {
        id: randomUUID(),
        username,
        email,
        displayName: displayName ?? username,
        image,
        ...toOAuthLinkData(provider, providerAccountId),
        lastLoginAt: new Date(),
      },
      select: authUserSelect,
    });
    return toAuthUserDto(created);
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const fallbackByProvider = await db.user.findFirst({
      where: toOAuthWhere(provider, providerAccountId),
      select: authUserSelect,
    });

    if (fallbackByProvider) return toAuthUserDto(fallbackByProvider);

    throw new AuthValidationError('Unable to complete OAuth sign-in.');
  }
}
