import { executeChat } from '@/agent/chat';

export async function POST(req: Request) {
  return executeChat(req);
}
