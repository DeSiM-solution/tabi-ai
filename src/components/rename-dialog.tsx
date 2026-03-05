'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LuCheck, LuX } from 'react-icons/lu';

interface RenameDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  value: string;
  placeholder?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RenameDialog({
  open,
  title = 'Rename',
  description,
  value,
  placeholder = 'Enter a new name',
  confirmLabel = 'Save',
  confirmDisabled = false,
  onChange,
  onCancel,
  onConfirm,
}: RenameDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

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
        className="w-full max-w-[400px] rounded-[12px] border border-border-light bg-bg-elevated p-6 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
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

        {description ? (
          <p className="mt-4 text-[13px] leading-[1.5] text-text-secondary">{description}</p>
        ) : null}

        <input
          ref={inputRef}
          value={value}
          onChange={event => onChange(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (confirmDisabled) return;
            onConfirm();
          }}
          placeholder={placeholder}
          className="mt-4 h-10 w-full rounded-[8px] border border-border-default bg-bg-elevated px-3 text-[13px] text-text-primary outline-none transition focus:border-accent-primary"
        />

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
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-accent-primary px-4 text-[13px] font-medium text-text-inverse transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LuCheck className="h-[14px] w-[14px]" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
