import {
  FiMapPin,
  FiPlus,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import {
  BLOCK_TYPES,
  createBlockId,
  normalizeBlockType,
  type EditableBlockDraft,
  type EditorSession,
} from '../_lib/chat-utils';

interface BlockEditorWorkspaceProps {
  session: EditorSession | null;
  onChange: (session: EditorSession) => void;
}

export function BlockEditorWorkspace({
  session,
  onChange,
}: BlockEditorWorkspaceProps) {
  if (!session) return null;
  const thumbnailUrl = session.thumbnailUrl.trim();

  const createNewBlock = (): EditableBlockDraft => {
    const nextIndex = session.blocks.length + 1;
    return {
      block_id: createBlockId(),
      type: 'spot',
      title: `Block ${nextIndex}`,
      description: '',
      smart_tags: ['#tag'],
      latInput: '',
      lngInput: '',
      newTagInput: '',
    };
  };

  const insertBlockAt = (index: number) => {
    const safeIndex = Math.min(Math.max(index, 0), session.blocks.length);
    const nextBlock: EditableBlockDraft = createNewBlock();

    onChange({
      ...session,
      blocks: [
        ...session.blocks.slice(0, safeIndex),
        nextBlock,
        ...session.blocks.slice(safeIndex),
      ],
    });
  };

  const deleteBlock = (index: number) => {
    onChange({
      ...session,
      blocks: session.blocks.filter((_, i) => i !== index),
    });
  };

  const updateBlock = (index: number, updater: (block: EditableBlockDraft) => EditableBlockDraft) => {
    onChange({
      ...session,
      blocks: session.blocks.map((block, i) => (i === index ? updater(block) : block)),
    });
  };

  const renderInsertControl = (insertIndex: number, key: string) => (
    <div key={key} className="group relative py-1">
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border-light" />
      <button
        type="button"
        onClick={() => insertBlockAt(insertIndex)}
        className="relative mx-auto inline-flex items-center gap-1 rounded-full border border-border-default bg-bg-elevated px-2.5 py-1 text-[11px] font-medium text-text-secondary opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100 hover:border-accent-primary hover:text-accent-primary focus-visible:opacity-100 focus-visible:outline-none"
      >
        <FiPlus className="h-3.5 w-3.5" />
        Add block
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[12px] border border-border-light bg-bg-primary">
      <div
        className={`relative shrink-0 overflow-hidden border-b border-border-light px-4 ${
          thumbnailUrl ? 'h-40 py-4' : 'py-3'
        }`}
      >
        {thumbnailUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `linear-gradient(120deg, rgba(15, 23, 42, 0.84), rgba(15, 23, 42, 0.48)), url(${thumbnailUrl})`,
            }}
          />
        )}
        {!thumbnailUrl && <div className="absolute inset-0 bg-bg-elevated" />}
        <div className={`relative ${thumbnailUrl ? 'flex h-full items-end' : ''}`}>
          <div>
            <p
              className={`text-sm font-semibold ${
                thumbnailUrl ? 'text-white' : 'text-text-primary'
              }`}
            >
              Edit Blocks
            </p>
            <p
              className={`text-xs ${
                thumbnailUrl ? 'text-white/80' : 'text-text-tertiary'
              }`}
            >
              Modify blocks and coordinates with the toolbar actions above.
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-4 grid gap-3 rounded-[10px] border border-border-light bg-bg-elevated p-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-tertiary">Title</span>
            <input
              value={session.title}
              onChange={e => onChange({ ...session, title: e.currentTarget.value })}
              className="w-full rounded-lg border border-border-default bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
              placeholder="Guide title"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-tertiary">Thumbnail URL</span>
            <input
              value={session.thumbnailUrl}
              onChange={e =>
                onChange({ ...session, thumbnailUrl: e.currentTarget.value })
              }
              className="w-full rounded-lg border border-border-default bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
              placeholder="https://i.ytimg.com/vi/.../maxresdefault.jpg"
            />
          </label>
        </div>

        <div className="space-y-3">
          {session.blocks.map((block, index) => (
            <div key={`${block.block_id}-${index}`} className="space-y-3">
              {renderInsertControl(index, `insert-before-${block.block_id}-${index}`)}
              <div className="rounded-[10px] border border-border-light bg-bg-elevated p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Block #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteBlock(index)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-border-default px-2 py-1 text-xs font-medium text-accent-secondary transition hover:bg-bg-secondary"
                  >
                    <FiTrash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>

                <div className="grid gap-3">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-text-tertiary">BLOCK_TYPE</span>
                    <select
                      value={block.type}
                      onChange={e =>
                        updateBlock(index, current => ({
                          ...current,
                          type: normalizeBlockType(e.currentTarget.value),
                        }))
                      }
                      className="w-full rounded-lg border border-border-default bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
                    >
                      {BLOCK_TYPES.map(type => (
                        <option key={type} value={type}>
                          {type.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-text-tertiary">title</span>
                    <input
                      value={block.title}
                      onChange={e =>
                        updateBlock(index, current => ({
                          ...current,
                          title: e.currentTarget.value,
                        }))
                      }
                      className="w-full rounded-lg border border-border-default bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-text-tertiary">description</span>
                    <input
                      value={block.description}
                      onChange={e =>
                        updateBlock(index, current => ({
                          ...current,
                          description: e.currentTarget.value,
                        }))
                      }
                      className="w-full rounded-lg border border-border-default bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
                    />
                  </label>
                </div>

                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-text-tertiary">Smart Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {block.smart_tags.map((tag, tagIndex) => (
                      <span
                        key={`${tag}-${tagIndex}`}
                        className="inline-flex items-center gap-1 rounded-full border border-border-default bg-bg-secondary px-2 py-1 text-xs text-text-secondary"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() =>
                            updateBlock(index, current => ({
                              ...current,
                              smart_tags: current.smart_tags.filter((_, i) => i !== tagIndex),
                            }))
                          }
                          className="text-text-tertiary transition hover:text-accent-secondary"
                          aria-label={`remove tag ${tag}`}
                        >
                          <FiX className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={block.newTagInput}
                      onChange={e =>
                        updateBlock(index, current => ({
                          ...current,
                          newTagInput: e.currentTarget.value,
                        }))
                      }
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        updateBlock(index, current => {
                          const raw = current.newTagInput.trim();
                          if (!raw) return current;
                          const nextTag = raw.startsWith('#') ? raw : `#${raw}`;
                          if (current.smart_tags.includes(nextTag)) {
                            return { ...current, newTagInput: '' };
                          }
                          return {
                            ...current,
                            smart_tags: [...current.smart_tags, nextTag],
                            newTagInput: '',
                          };
                        });
                      }}
                      className="w-full rounded-lg border border-border-default bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
                      placeholder="Type a tag and press Enter or click Add"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateBlock(index, current => {
                          const raw = current.newTagInput.trim();
                          if (!raw) return current;
                          const nextTag = raw.startsWith('#') ? raw : `#${raw}`;
                          if (current.smart_tags.includes(nextTag)) {
                            return { ...current, newTagInput: '' };
                          }
                          return {
                            ...current,
                            smart_tags: [...current.smart_tags, nextTag],
                            newTagInput: '',
                          };
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-border-default px-2 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-bg-secondary hover:text-text-primary"
                    >
                      <FiPlus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-lg bg-bg-secondary p-2">
                  <FiMapPin className="h-4 w-4 text-text-tertiary" />
                  <input
                    value={block.latInput}
                    onChange={e =>
                      updateBlock(index, current => ({
                        ...current,
                        latInput: e.currentTarget.value,
                      }))
                    }
                    className="w-full rounded-md border border-border-default bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
                    placeholder="lat"
                  />
                  <input
                    value={block.lngInput}
                    onChange={e =>
                      updateBlock(index, current => ({
                        ...current,
                        lngInput: e.currentTarget.value,
                      }))
                    }
                    className="w-full rounded-md border border-border-default bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary"
                    placeholder="lng"
                  />
                </div>
              </div>
            </div>
          ))}

          {session.blocks.length > 0 &&
            renderInsertControl(session.blocks.length, 'insert-after-last')}

          {session.blocks.length === 0 && (
            <div className="rounded-xl border border-dashed border-border-default bg-bg-elevated p-6 text-center text-sm text-text-tertiary">
              <p>There are no blocks yet.</p>
              <button
                type="button"
                onClick={() => insertBlockAt(0)}
                className="mt-3 inline-flex items-center gap-1 rounded-full border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-accent-primary hover:text-accent-primary"
              >
                <FiPlus className="h-3.5 w-3.5" />
                Add first block
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
