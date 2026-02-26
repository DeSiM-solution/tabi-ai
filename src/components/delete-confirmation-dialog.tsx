'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LuTrash2, LuX } from 'react-icons/lu';

interface DeleteConfirmationDialogProps {
  open: boolean;
  title?: string;
  description: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}

export function DeleteConfirmationDialog({
  open,
  title = 'Delete Guide?',
  description,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
  confirmDisabled = false,
}: DeleteConfirmationDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onCancel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#2D2A26]/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[380px] rounded-[12px] border border-border-light bg-bg-elevated p-6 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-text-tertiary transition hover:bg-bg-secondary hover:text-text-secondary"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-5 text-[13px] leading-[1.5] text-text-secondary">{description}</p>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-[8px] border border-border-default px-4 text-[13px] font-medium text-text-primary transition hover:bg-bg-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-accent-secondary px-4 text-[13px] font-medium text-text-inverse transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LuTrash2 className="h-[14px] w-[14px]" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
