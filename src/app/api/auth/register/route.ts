import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  AuthValidationError,
  registerWithPassword,
} from '@/server/auth';
import {
  USER_ID_COOKIE_MAX_AGE_SECONDS,
  USER_ID_COOKIE_NAME,
} from '@/lib/user-identity';

const registerSchema = z.object({
  username: z.string().trim().min(1),
  email: z.string().trim().email().optional().nullable(),
  password: z.string().min(1),
  displayName: z.string().trim().optional().nullable(),
});

function toRegisterErrorResponse(error: unknown): { status: number; message: string } {
  if (
    error instanceof TypeError &&
    /undefined \(reading '(create|findFirst|findUnique|update|upsert)'\)/.test(
      error.message,
    )
  ) {
    return {
      status: 500,
      message:
        'Prisma client is outdated. Run `npm run prisma:generate` and restart the dev server.',
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 503,
      message: 'Database is unavailable. Please check DATABASE_URL and retry.',
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2021' || error.code === 'P2022') {
      return {
        status: 500,
        message: 'Database schema is out of date. Run `npm run prisma:push` and retry.',
      };
    }
  }

  return { status: 500, message: 'Failed to register.' };
}

function toDebugErrorDetails(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const message = error.message.trim();
    return `PrismaClientKnownRequestError(${error.code}): ${message}`;
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return `PrismaClientInitializationError: ${error.message.trim()}`;
  }

  if (error instanceof Error) {
    const name = error.name || 'Error';
    const message = error.message.trim();
    return `${name}: ${message}`;
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return undefined;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid register payload.' },
        { status: 400 },
      );
    }

    const user = await registerWithPassword(parsed.data);
    const response = NextResponse.json({ user }, { status: 201 });

    response.cookies.set({
      name: USER_ID_COOKIE_NAME,
      value: user.id,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: USER_ID_COOKIE_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    if (error instanceof AuthValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[auth_api] register-failed', error);
    const mapped = toRegisterErrorResponse(error);
    const payload: { error: string; details?: string } = {
      error: mapped.message,
    };
    if (process.env.NODE_ENV !== 'production') {
      const details = toDebugErrorDetails(error);
      if (details) payload.details = details;
    }
    return NextResponse.json(
      payload,
      { status: mapped.status },
    );
  }
}
