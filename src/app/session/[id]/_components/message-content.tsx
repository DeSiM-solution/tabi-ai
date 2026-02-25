import type { UIMessage } from 'ai';
import { FiEdit2 } from 'react-icons/fi';
import type { IconType } from 'react-icons/lib';
import {
  LuCheck,
  LuCode,
  LuFileText,
  LuImage,
  LuLoader,
  LuMapPin,
  LuSparkles,
  LuWrench,
  LuX,
} from 'react-icons/lu';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  canEditBlocks,
  getToolJsonPanel,
  getToolStatus,
  getToolSummary,
  isToolPart,
  type EditedOutputs,
  type ToolPart,
} from '../_lib/chat-utils';

const TOOL_ICON_BY_NAME: Record<string, IconType> = {
  parse_youtube_input: LuFileText,
  crawl_youtube_videos: LuCode,
  build_travel_blocks: LuFileText,
  resolve_spot_coordinates: LuMapPin,
  search_image: LuImage,
  generate_image: LuImage,
  generate_handbook_html: LuCode,
};

interface ToolCardProps {
  part: ToolPart;
  output: unknown;
  sourceKey: string;
  onOpenEditor: (sourceKey: string, toolName: string, output: unknown) => void;
}

function ToolCard({ part, output, sourceKey, onOpenEditor }: ToolCardProps) {
  const toolName = part.type.replace('tool-', '');
  const status = getToolStatus(part.state);
  const toolJsonPanel = getToolJsonPanel(toolName, part, output);
  const editable = canEditBlocks(toolName, part, output);
  const ToolIcon = TOOL_ICON_BY_NAME[toolName] ?? LuWrench;

  const statusToneClassName =
    status.tone === 'done'
      ? 'bg-status-success-bg text-status-success'
      : status.tone === 'failed'
        ? 'bg-status-fail-bg text-status-fail'
        : 'bg-status-warning-bg text-status-warning';
  const StatusIcon = status.tone === 'done' ? LuCheck : status.tone === 'failed' ? LuX : LuLoader;

  return (
    <div
      className={`rounded-[10px] border bg-bg-secondary px-3 py-3 ${
        status.tone === 'running' ? 'border-accent-primary' : 'border-border-light'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-accent-primary-bg text-accent-primary">
            <ToolIcon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate font-mono text-[11px] font-medium text-text-primary">
            {toolName}
          </span>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-[4px] px-2 py-[2px] text-[10px] font-medium ${statusToneClassName}`}
        >
          <StatusIcon
            className={`h-2.5 w-2.5 ${status.tone === 'running' ? 'animate-spin' : ''}`}
          />
          {status.label}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-[1.45] text-text-tertiary">
        {getToolSummary(toolName, part, output)}
      </p>
      {toolJsonPanel && (
        <div className="mt-3 rounded-[8px] border border-border-light bg-bg-elevated p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            {toolJsonPanel.title}
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.45] text-text-secondary">
            {toolJsonPanel.value}
          </pre>
          {editable && (
            <button
              type="button"
              onClick={() => onOpenEditor(sourceKey, toolName, output)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-[6px] border border-border-default bg-bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary"
            >
              <FiEdit2 className="h-3.5 w-3.5" />
              Edit blocks
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface MessageContentProps {
  message: UIMessage;
  editedToolOutputs: EditedOutputs;
  onOpenEditor: (sourceKey: string, toolName: string, output: unknown) => void;
}

export function MessageContent({
  message,
  editedToolOutputs,
  onOpenEditor,
}: MessageContentProps) {
  const assistantMarkdownClassName =
    'text-[14px] leading-[1.55] text-text-secondary [&_a]:text-accent-primary [&_a]:underline [&_code]:rounded-[4px] [&_code]:bg-bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-text-primary [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_p:last-child]:mb-0 [&_pre]:overflow-auto [&_pre]:rounded-[8px] [&_pre]:border [&_pre]:border-border-light [&_pre]:bg-bg-secondary [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border-default [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border-default [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5';

  return (
    <div className="space-y-3">
      {message.role === 'assistant' && (
        <div className="flex items-center gap-2">
          <LuSparkles className="h-4 w-4 text-accent-primary" />
          <p className="text-[14px] font-semibold text-text-primary">Guide Assistant</p>
        </div>
      )}
      {message.parts.map((part, i) => {
        if (part.type === 'text' && part.text) {
          if (message.role === 'user') {
            return (
              <p
                key={`${message.id}-${i}`}
                className="whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-text-inverse"
              >
                {part.text}
              </p>
            );
          }

          return (
            <div key={`${message.id}-${i}`} className={assistantMarkdownClassName}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
            </div>
          );
        }

        if (isToolPart(part)) {
          const sourceKey = `${message.id}:${i}:${part.type}`;
          const output = editedToolOutputs[sourceKey] ?? part.output;
          return (
            <ToolCard
              key={`${message.id}-${i}`}
              part={part}
              output={output}
              sourceKey={sourceKey}
              onOpenEditor={onOpenEditor}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
