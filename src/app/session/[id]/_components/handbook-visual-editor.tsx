'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuPlus, LuRefreshCw } from 'react-icons/lu';

import { useGrapesJsEditor } from '../_hooks/use-grapesjs-editor';
import { resolveHandbookAddBlockButtonPosition } from '../_lib/handbook-add-block-button-position';
import type {
  HandbookSelectionSnapshot,
  HandbookStyleProperty,
} from '../_lib/handbook-selection';

import { HandbookBlockToolbar } from './handbook-block-toolbar';
import { HandbookAddBlockModal } from './handbook-add-block-modal';
import { HandbookImagePickerModal } from './handbook-image-picker-modal';
import { HandbookTextToolbar } from './handbook-text-toolbar';

type HandbookVisualEditorProps = {
  documentHtml: string;
  sessionImageUrls: string[];
  onChange: (nextDocumentHtml: string) => void;
  onReadyChange?: (isReady: boolean) => void;
  onSelectionChange?: (selection: HandbookSelectionSnapshot | null) => void;
  onApplyStyleReady?: (
    applyStyle: ((property: HandbookStyleProperty, value: string) => boolean) | null,
  ) => void;
};

export function HandbookVisualEditor({
  documentHtml,
  sessionImageUrls,
  onChange,
  onReadyChange,
  onSelectionChange,
  onApplyStyleReady,
}: HandbookVisualEditorProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [addBlockModalComponentId, setAddBlockModalComponentId] = useState<string | null>(null);
  const {
    isReady,
    errorMessage,
    canvasRect,
    selection,
    hoverHighlight,
    imagePickerState,
    applySelectionStyle,
    applyImageFromPicker,
    closeImagePicker,
    textToolbarActions,
    blockToolbarActions,
  } = useGrapesJsEditor({
    container,
    documentHtml,
    onDocumentHtmlChange: onChange,
    onSelectionChange,
  });

  const textToolbarSelection =
    selection?.showTextToolbar && selection.anchorRect
      ? selection
      : null;
  const blockToolbarSelection =
    selection?.showBlockToolbar && selection.anchorRect && !textToolbarSelection
      ? selection
      : null;
  const addBlockSelection =
    blockToolbarSelection?.canDuplicate
      ? blockToolbarSelection
      : null;
  const addBlockAnchorRect =
    addBlockSelection?.anchorRect && canvasRect
      ? {
          top: addBlockSelection.anchorRect.top - canvasRect.top,
          left: addBlockSelection.anchorRect.left - canvasRect.left,
          width: addBlockSelection.anchorRect.width,
          height: addBlockSelection.anchorRect.height,
        }
      : null;
  const addBlockButtonPosition =
    addBlockAnchorRect && canvasRect
      ? resolveHandbookAddBlockButtonPosition({
          anchorRect: addBlockAnchorRect,
          buttonSize: 32,
          viewportWidth: canvasRect.width,
          viewportHeight: canvasRect.height,
        })
      : null;
  const addBlockTriggerRect =
    addBlockButtonPosition
      ? {
          top: addBlockButtonPosition.top,
          left: addBlockButtonPosition.left,
          width: 32,
          height: 32,
        }
      : null;
  const addBlockModalOpen =
    !!addBlockSelection
    && !!addBlockTriggerRect
    && addBlockModalComponentId === addBlockSelection.componentId;

  useEffect(() => {
    onReadyChange?.(isReady);
  }, [isReady, onReadyChange]);

  useEffect(() => {
    onApplyStyleReady?.(applySelectionStyle);
    return () => {
      onApplyStyleReady?.(null);
    };
  }, [applySelectionStyle, onApplyStyleReady]);

  useEffect(() => {
    if (!imagePickerState.open) return;
    console.info('[image-picker] modal-visible', {
      mode: imagePickerState.mode,
      currentImageUrl: imagePickerState.currentImageUrl,
      sessionImageCount: sessionImageUrls.length,
    });
  }, [imagePickerState.currentImageUrl, imagePickerState.mode, imagePickerState.open, sessionImageUrls.length]);

  if (errorMessage) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center bg-bg-elevated px-6 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-semibold text-text-primary">
            Visual editor is unavailable for this handbook.
          </p>
          <p className="text-sm text-text-secondary">
            {errorMessage}
          </p>
          <p className="text-xs text-text-tertiary">
            The stored handbook artifact is unchanged. Try another handbook version or
            regenerate a cleaner visual-editable guide.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative h-full min-h-[360px] overflow-hidden bg-white">
        {!isReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-2">
              <LuRefreshCw className="h-7 w-7 animate-spin text-accent-primary" />
              <p className="text-[13px] font-medium text-text-secondary">
                Loading visual editor...
              </p>
            </div>
          </div>
        )}

        <div ref={setContainer} className="h-full min-h-[360px]" />
      </div>

      {typeof document !== 'undefined' && canvasRect
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[120] overflow-visible"
              style={{
                top: canvasRect.top,
                left: canvasRect.left,
                width: canvasRect.width,
                height: canvasRect.height,
              }}
            >
              {hoverHighlight && (
                <>
                  <div
                    className="absolute border-[2px] border-[#3B82F6]"
                    style={{
                      top: hoverHighlight.anchorRect.top - canvasRect.top,
                      left: hoverHighlight.anchorRect.left - canvasRect.left,
                      width: hoverHighlight.anchorRect.width,
                      height: hoverHighlight.anchorRect.height,
                    }}
                  />

                  {hoverHighlight.margin.top > 0 && (
                    <div
                      className="absolute bg-[#F59E0B]/30"
                      style={{
                        top:
                          hoverHighlight.anchorRect.top
                          - canvasRect.top
                          - hoverHighlight.margin.top,
                        left:
                          hoverHighlight.anchorRect.left
                          - canvasRect.left
                          - hoverHighlight.margin.left,
                        width:
                          hoverHighlight.anchorRect.width
                          + hoverHighlight.margin.left
                          + hoverHighlight.margin.right,
                        height: hoverHighlight.margin.top,
                      }}
                    />
                  )}
                  {hoverHighlight.margin.right > 0 && (
                    <div
                      className="absolute bg-[#F59E0B]/30"
                      style={{
                        top:
                          hoverHighlight.anchorRect.top
                          - canvasRect.top
                          - hoverHighlight.margin.top,
                        left:
                          hoverHighlight.anchorRect.left
                          - canvasRect.left
                          + hoverHighlight.anchorRect.width,
                        width: hoverHighlight.margin.right,
                        height:
                          hoverHighlight.anchorRect.height
                          + hoverHighlight.margin.top
                          + hoverHighlight.margin.bottom,
                      }}
                    />
                  )}
                  {hoverHighlight.margin.bottom > 0 && (
                    <div
                      className="absolute bg-[#F59E0B]/30"
                      style={{
                        top:
                          hoverHighlight.anchorRect.top
                          - canvasRect.top
                          + hoverHighlight.anchorRect.height,
                        left:
                          hoverHighlight.anchorRect.left
                          - canvasRect.left
                          - hoverHighlight.margin.left,
                        width:
                          hoverHighlight.anchorRect.width
                          + hoverHighlight.margin.left
                          + hoverHighlight.margin.right,
                        height: hoverHighlight.margin.bottom,
                      }}
                    />
                  )}
                  {hoverHighlight.margin.left > 0 && (
                    <div
                      className="absolute bg-[#F59E0B]/30"
                      style={{
                        top:
                          hoverHighlight.anchorRect.top
                          - canvasRect.top
                          - hoverHighlight.margin.top,
                        left:
                          hoverHighlight.anchorRect.left
                          - canvasRect.left
                          - hoverHighlight.margin.left,
                        width: hoverHighlight.margin.left,
                        height:
                          hoverHighlight.anchorRect.height
                          + hoverHighlight.margin.top
                          + hoverHighlight.margin.bottom,
                      }}
                    />
                  )}

                  {hoverHighlight.padding.top > 0 && (
                    <div
                      className="absolute bg-[#10B981]/24"
                      style={{
                        top: hoverHighlight.anchorRect.top - canvasRect.top,
                        left: hoverHighlight.anchorRect.left - canvasRect.left,
                        width: hoverHighlight.anchorRect.width,
                        height: hoverHighlight.padding.top,
                      }}
                    />
                  )}
                  {hoverHighlight.padding.right > 0 && (
                    <div
                      className="absolute bg-[#10B981]/24"
                      style={{
                        top: hoverHighlight.anchorRect.top - canvasRect.top,
                        left:
                          hoverHighlight.anchorRect.left
                          - canvasRect.left
                          + hoverHighlight.anchorRect.width
                          - hoverHighlight.padding.right,
                        width: hoverHighlight.padding.right,
                        height: hoverHighlight.anchorRect.height,
                      }}
                    />
                  )}
                  {hoverHighlight.padding.bottom > 0 && (
                    <div
                      className="absolute bg-[#10B981]/24"
                      style={{
                        top:
                          hoverHighlight.anchorRect.top
                          - canvasRect.top
                          + hoverHighlight.anchorRect.height
                          - hoverHighlight.padding.bottom,
                        left: hoverHighlight.anchorRect.left - canvasRect.left,
                        width: hoverHighlight.anchorRect.width,
                        height: hoverHighlight.padding.bottom,
                      }}
                    />
                  )}
                  {hoverHighlight.padding.left > 0 && (
                    <div
                      className="absolute bg-[#10B981]/24"
                      style={{
                        top: hoverHighlight.anchorRect.top - canvasRect.top,
                        left: hoverHighlight.anchorRect.left - canvasRect.left,
                        width: hoverHighlight.padding.left,
                        height: hoverHighlight.anchorRect.height,
                      }}
                    />
                  )}

                  <div
                    className="absolute inline-flex items-center gap-1.5 rounded-[8px] bg-[#3B82F6] px-2.5 py-1 text-[12px] font-semibold text-white shadow-[0_6px_14px_rgba(59,130,246,0.35)]"
                    style={{
                      top: hoverHighlight.anchorRect.top - canvasRect.top - 30,
                      left: hoverHighlight.anchorRect.left - canvasRect.left + 4,
                    }}
                  >
                    <span>{hoverHighlight.kind}</span>
                  </div>
                </>
              )}

              {blockToolbarSelection && (
                <HandbookBlockToolbar
                  selection={blockToolbarSelection}
                  actions={blockToolbarActions}
                  canvasRect={canvasRect}
                />
              )}

              {addBlockSelection && addBlockButtonPosition && (
                <button
                  type="button"
                  title="Add Block"
                  aria-label="Add Block"
                  aria-haspopup="dialog"
                  aria-expanded={addBlockModalOpen}
                  onClick={() => {
                    if (!addBlockSelection) return;
                    setAddBlockModalComponentId(previous => (
                      previous === addBlockSelection.componentId
                        ? null
                        : addBlockSelection.componentId
                    ));
                  }}
                  className="pointer-events-auto absolute z-[81] inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#3B97E3] bg-[#2B8AE4] text-white shadow-[0_4px_10px_rgba(43,138,228,0.35)] transition hover:brightness-105"
                  style={addBlockButtonPosition}
                >
                  <LuPlus className="h-4 w-4" />
                </button>
              )}

              {addBlockModalOpen && addBlockTriggerRect && canvasRect && (
                <HandbookAddBlockModal
                  open={addBlockModalOpen}
                  title="Add Block"
                  triggerRect={addBlockTriggerRect}
                  viewportWidth={canvasRect.width}
                  viewportHeight={canvasRect.height}
                  onAddBlock={selection => {
                    return blockToolbarActions.addBlock(selection);
                  }}
                  onClose={() => {
                    setAddBlockModalComponentId(null);
                  }}
                />
              )}
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && textToolbarSelection
        ? createPortal(
            <HandbookTextToolbar selection={textToolbarSelection} actions={textToolbarActions} />,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && imagePickerState.open
        ? createPortal(
            <HandbookImagePickerModal
              open={imagePickerState.open}
              currentImageUrl={imagePickerState.currentImageUrl}
              sessionImageUrls={sessionImageUrls}
              onSelectImage={applyImageFromPicker}
              onClose={closeImagePicker}
            />,
            document.body,
          )
        : null}

    </>
  );
}
