import { toast } from 'sonner';

import {
  applyEditorSession,
  buildGoogleMapsCsv,
  type GoogleMapsCsvRow,
  isRecord,
  toFileSlug,
  type EditorSession,
  type UnknownRecord,
} from '../_lib/chat-utils';
import { patchSessionState } from '../_lib/session-api';
import { PERSISTABLE_BLOCK_TOOL_NAMES } from '../_lib/session-page-constants';
import {
  buildGoogleMapsDirectionsUrl,
  SPOTS_CSV_FIELDS_LINE,
} from '../_lib/spots-view-model';
import { sessionEditorActions } from '../_stores/session-editor-store';

export type CsvExportGuideState = {
  exportedCount: number;
  fileName: string;
  csvContent: string;
  fieldsLine: string;
  previewText: string;
  openMapsUrl: string;
};

export type PersistEditorOutputArgs = {
  sessionId: string;
  session: EditorSession;
  output: UnknownRecord;
};

export async function persistEditorOutput({
  sessionId,
  session,
  output,
}: PersistEditorOutputArgs): Promise<boolean> {
  const blocks = Array.isArray(output.blocks) ? output.blocks : undefined;
  const spotBlocks = Array.isArray(output.spot_blocks) ? output.spot_blocks : undefined;
  const toolOutputs = PERSISTABLE_BLOCK_TOOL_NAMES.has(session.toolName)
    ? { [session.toolName]: output }
    : undefined;

  if (!blocks && !spotBlocks && !toolOutputs) return true;

  return patchSessionState(sessionId, {
    blocks,
    spotBlocks,
    toolOutputs,
  });
}

export type SaveEditorSessionArgs = {
  sessionId: string;
  session: EditorSession;
  isSavingBlocks: boolean;
  requireLogin: (description: string) => boolean;
  markEditorSessionAsSaved: (session: EditorSession) => void;
};

export async function saveEditorSession({
  sessionId,
  session,
  isSavingBlocks,
  requireLogin,
  markEditorSessionAsSaved,
}: SaveEditorSessionArgs): Promise<void> {
  if (!requireLogin('Editing session data requires an account login.')) return;
  if (!sessionId) return;
  if (isSavingBlocks) return;

  sessionEditorActions.setIsSavingBlocks(sessionId, true);
  try {
    const nextOutput = applyEditorSession(session);
    sessionEditorActions.upsertEditedToolOutput(
      sessionId,
      session.sourceKey,
      nextOutput,
    );
    const saved = await persistEditorOutput({
      sessionId,
      session,
      output: nextOutput,
    });
    if (!saved) {
      toast.error('Failed to save session data. Please try again.');
      return;
    }
    markEditorSessionAsSaved(session);
    toast.success('Session data saved.');
    console.log('[chat-ui] blocks-saved', {
      sourceKey: session.sourceKey,
      toolName: session.toolName,
      blockCount: Array.isArray(nextOutput.blocks) ? nextOutput.blocks.length : 0,
    });
  } catch (error) {
    console.error('[chat-ui] save-blocks-failed', error);
    toast.error(error instanceof Error ? error.message : 'Failed to save session data.');
  } finally {
    sessionEditorActions.setIsSavingBlocks(sessionId, false);
  }
}

function toCsvPreviewText(rows: GoogleMapsCsvRow[]): string {
  return rows
    .slice(0, 4)
    .map((row, index) => {
      const name = row.name.replace(/\s+/g, ' ').trim() || 'Untitled Spot';
      const tags = row.tags.trim() || '-';
      return `${index + 1}) ${name} | tags: ${tags}`;
    })
    .join('\n');
}

export function exportEditorSessionCsv(
  session: EditorSession,
  setCsvExportGuide: (state: CsvExportGuideState) => void,
): void {
  const nextOutput = applyEditorSession(session);
  const rawBlocks = Array.isArray(nextOutput.blocks) ? nextOutput.blocks : [];
  const spotCount = rawBlocks.reduce((count, block) => {
    if (!isRecord(block)) return count;
    return block.type === 'spot' ? count + 1 : count;
  }, 0);

  const csvResult = buildGoogleMapsCsv(nextOutput);
  if (!csvResult) {
    if (spotCount === 0) {
      toast.warning('No spots found. Add at least one spot first.');
      return;
    }
    toast.warning('No valid coordinates found. Please add lat/lng to your spot entries.');
    return;
  }

  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;
  const fileName = `${toFileSlug(session.title)}-${timestamp}.csv`;

  setCsvExportGuide({
    exportedCount: csvResult.rowCount,
    fileName,
    csvContent: csvResult.csv,
    fieldsLine: SPOTS_CSV_FIELDS_LINE,
    previewText: toCsvPreviewText(csvResult.rows),
    openMapsUrl: buildGoogleMapsDirectionsUrl(csvResult.rows),
  });
}
