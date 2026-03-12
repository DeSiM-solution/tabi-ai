'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuChevronDown, LuDownload, LuExternalLink, LuX } from 'react-icons/lu';

interface CsvExportGuideDialogProps {
  open: boolean;
  fieldsLine: string;
  previewText: string;
  onClose: () => void;
  onDownloadCsv: () => void;
  onOpenMaps: () => void;
}

export function CsvExportGuideDialog({
  open,
  fieldsLine,
  previewText,
  onClose,
  onDownloadCsv,
  onOpenMaps,
}: CsvExportGuideDialogProps) {
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  const fallbackNote =
    'If the Open Maps link doesn’t work, click Download CSV and import the file in Google My Maps.';

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#2D2A26]/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Open Maps or Download CSV"
        className="w-full max-w-[560px] rounded-[12px] border border-border-light bg-bg-elevated p-6 shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-text-primary">
              Open Maps or Download CSV
            </h2>
            <p className="mt-2 text-[13px] leading-[1.5] text-text-secondary">
              You have two options: Open Maps directly via URL, or download CSV and import it in
              My Maps.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-text-tertiary transition hover:bg-bg-secondary hover:text-text-secondary"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onOpenMaps}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-accent-primary px-4 text-[13px] font-semibold text-text-inverse transition hover:brightness-95"
          >
            <LuExternalLink className="h-4 w-4" />
            <span>Open Maps</span>
          </button>
          <button
            type="button"
            onClick={onDownloadCsv}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border-light bg-bg-secondary px-4 text-[13px] font-semibold text-text-primary transition hover:bg-bg-primary"
          >
            <LuDownload className="h-4 w-4" />
            <span>Download CSV</span>
          </button>
        </div>

        <div className="mt-4 rounded-[10px] border border-border-light bg-bg-primary px-3 py-3">
          <p className="text-[12px] font-semibold leading-[1.4] text-text-primary">
           Download CSV include all fields data.
          </p>
          <p className="mt-1 text-[11px] font-semibold text-text-secondary">{fieldsLine}</p>
          <button
            type="button"
            onClick={() => setIsPreviewExpanded(expanded => !expanded)}
            className="mt-2 inline-flex w-full items-center gap-1.5 rounded-[8px] border border-border-light bg-bg-elevated px-2.5 py-2 text-[12px] font-semibold text-text-secondary"
          >
            <LuChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                isPreviewExpanded ? 'rotate-180' : ''
              }`}
            />
            <span>CSV preview</span>
          </button>
          {isPreviewExpanded ? (
            <div className="mt-2 rounded-[8px] border border-border-light bg-bg-elevated px-2.5 py-2">
              <p className="whitespace-pre-wrap break-words text-[12px] leading-[1.5] text-text-secondary">
                {previewText}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onOpenMaps}
            className="mt-2 inline-flex w-full items-center rounded-[8px] border border-[#8BD9CF] bg-[#E7F8F4] px-3 py-2 text-left transition hover:brightness-95"
          >
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0F766E]">
              <LuExternalLink className="h-3.5 w-3.5" />
              Open My Maps to import downloaded CSV
            </span>
          </button>
        </div>

        <div className="mt-4 rounded-[10px] border border-[#FED7AA] bg-[#FFF7ED] px-3 py-3">
          <p className="text-[12px] font-semibold text-[#9A3412]">Fallback behavior</p>
          <p className="mt-1 text-[12px] leading-[1.5] text-[#9A3412]">
            {fallbackNote}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
