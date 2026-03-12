import { applyEditorSession, type EditorSession } from './chat-utils';

export function toEditorSessionSignature(session: EditorSession): string {
  return JSON.stringify(applyEditorSession(session));
}
