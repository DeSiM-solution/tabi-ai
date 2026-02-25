import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  AuthValidationError,
  loginWithPassword,
} from '@/server/auth';
import {
  USER_ID_COOKIE_MAX_AGE_SECONDS,
  USER_ID_COOKIE_NAME,
} from '@/lib/user-identity';

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

function toLoginErrorResponse(error: unknown): { status: number; message: string } {
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

  return { status: 500, message: 'Failed to login.' };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid login payload.' },
        { status: 400 },
      );
    }

    const user = await loginWithPassword(parsed.data);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username/email or password.' },
        { status: 401 },
      );
    }
    const response = NextResponse.json({ user });

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

    console.error('[auth_api] login-failed', error);
    const mapped = toLoginErrorResponse(error);
    return NextResponse.json(
      { error: mapped.message },
      { status: mapped.status },
    );
  }
}
