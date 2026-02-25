import { executeChat } from '@/agent/chat';
import { getRequestUserId } from '@/server/request-user';

export async function POST(req: Request) {
  try {
    const userId = getRequestUserId(req);
    return executeChat(req, userId);
  } catch (error) {
    console.error('[chat_api] missing-user-context', error);
    return new Response('Missing user context.', { status: 401 });
  }
}
