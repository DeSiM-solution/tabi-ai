import { LuArrowRight, LuCheck } from 'react-icons/lu';

import type { HandbookStyleId } from '@/lib/handbook-style';
import { AestheticStyleSelector } from '@/components/aesthetic-style-selector';

type SessionStyleConfirmModalProps = {
  open: boolean;
  selectedStyleOption: HandbookStyleId;
  setSelectedStyleOption: (next: HandbookStyleId) => void;
  setAsSessionDefault: boolean;
  onToggleSetAsSessionDefault: () => void;
  isBusy: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

export function SessionStyleConfirmModal({
  open,
  selectedStyleOption,
  setSelectedStyleOption,
  setAsSessionDefault,
  onToggleSetAsSessionDefault,
  isBusy,
  onClose,
  onSubmit,
}: SessionStyleConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#2D2A26]/38 px-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose style for this remix"
        className="w-full max-w-[520px] rounded-[20px] border border-border-light bg-bg-elevated p-6 shadow-[0_16px_42px_rgba(26,23,20,0.14)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="space-y-1.5">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Before Remix
          </p>
          <h2 className="text-[28px] font-bold tracking-[-0.02em] text-text-primary">
            Choose your guide&apos;s aesthetic
          </h2>
          <p className="text-[13px] leading-[1.45] text-text-secondary">
            Match your channel&apos;s visual identity for this handbook remix.
          </p>
        </div>

        <p className="mt-6 text-[15px] font-semibold text-text-primary">
          Aesthetic
        </p>
        <AestheticStyleSelector
          className="mt-3"
          value={selectedStyleOption}
          onChange={setSelectedStyleOption}
          disabled={isBusy}
        />

        <button
          type="button"
          onClick={onToggleSetAsSessionDefault}
          className="mt-5 inline-flex items-center gap-2 rounded-[8px] py-1 text-left"
        >
          <span
            className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] transition ${
              setAsSessionDefault
                ? 'bg-accent-primary text-text-inverse'
                : 'border border-border-default bg-bg-elevated text-transparent'
            }`}
          >
            <LuCheck className="h-3 w-3" />
          </span>
          <span className="text-[13px] font-medium text-text-secondary">
            Set as session default
          </span>
        </button>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-[12px] border border-border-light bg-bg-secondary px-[18px] text-[14px] font-semibold text-text-secondary transition hover:bg-bg-elevated"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isBusy}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[14px] bg-gradient-to-r from-[#F97066] to-[#FB923C] px-5 text-[14px] font-semibold text-text-inverse transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>Remix</span>
            <LuArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
