'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LuSearch, LuUpload, LuLink2, LuX } from 'react-icons/lu';

type HandbookImagePickerModalProps = {
  open: boolean;
  currentImageUrl: string;
  sessionImageUrls: string[];
  onSelectImage: (imageUrl: string) => void;
  onClose: () => void;
};

function normalizeImageUrl(value: string): string {
  return value.trim();
}

function toImageLabel(imageUrl: string, index: number): string {
  const normalizedImageUrl = imageUrl.trim();
  if (!normalizedImageUrl) return `image-${index + 1}`;
  try {
    const parsedUrl = new URL(normalizedImageUrl);
    const pathnamePart = parsedUrl.pathname.split('/').pop()?.trim() ?? '';
    if (pathnamePart) return pathnamePart;
  } catch {
    // Keep fallback logic for non-URL strings.
  }

  const pathnamePart = normalizedImageUrl.split('/').pop()?.trim() ?? '';
  if (pathnamePart) return pathnamePart;
  return `image-${index + 1}`;
}

export function HandbookImagePickerModal({
  open,
  currentImageUrl,
  sessionImageUrls,
  onSelectImage,
  onClose,
}: HandbookImagePickerModalProps) {
  const [searchValue, setSearchValue] = useState('');
  const [manualUrls, setManualUrls] = useState<string[]>([]);
  const [manualUrlDraft, setManualUrlDraft] = useState('');
  const [manualUrlPopoverOpen, setManualUrlPopoverOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const manualUrlButtonRef = useRef<HTMLButtonElement | null>(null);
  const manualUrlInputRef = useRef<HTMLInputElement | null>(null);
  const manualUrlPopoverRef = useRef<HTMLDivElement | null>(null);

  const allImageUrls = useMemo(() => {
    const urls = new Set<string>();
    const pushUrl = (value: string) => {
      const normalized = normalizeImageUrl(value);
      if (!normalized) return;
      urls.add(normalized);
    };

    pushUrl(currentImageUrl);
    for (const imageUrl of manualUrls) {
      pushUrl(imageUrl);
    }
    for (const imageUrl of sessionImageUrls) {
      pushUrl(imageUrl);
    }

    return Array.from(urls);
  }, [currentImageUrl, manualUrls, sessionImageUrls]);

  const filteredImageUrls = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) return allImageUrls;
    return allImageUrls.filter(imageUrl => imageUrl.toLowerCase().includes(keyword));
  }, [allImageUrls, searchValue]);

  useEffect(() => {
    if (!manualUrlPopoverOpen) return;
    manualUrlInputRef.current?.focus();
  }, [manualUrlPopoverOpen]);

  useEffect(() => {
    if (!manualUrlPopoverOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (manualUrlButtonRef.current?.contains(target)) return;
      if (manualUrlPopoverRef.current?.contains(target)) return;
      setManualUrlPopoverOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setManualUrlPopoverOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [manualUrlPopoverOpen]);

  const canSubmitManualUrl = normalizeImageUrl(manualUrlDraft).length > 0;

  const handleModalClose = () => {
    setManualUrlPopoverOpen(false);
    setManualUrlDraft('');
    onClose();
  };

  const submitManualUrl = () => {
    const normalizedImageUrl = normalizeImageUrl(manualUrlDraft);
    if (!normalizedImageUrl) return;

    setManualUrls(previous => (
      previous.includes(normalizedImageUrl)
        ? previous
        : [normalizedImageUrl, ...previous]
    ));
    onSelectImage(normalizedImageUrl);
    setManualUrlDraft('');
    setManualUrlPopoverOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[#2D2A26]/35 px-4 backdrop-blur-[1px]"
      onClick={handleModalClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select image"
        className="w-full max-w-[640px] rounded-[12px] border border-[#D1D5DB] bg-white p-3 shadow-[0_18px_42px_rgba(17,24,39,0.18)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#111827]">
            Select Image
          </h2>
          <button
            type="button"
            aria-label="Close image picker"
            title="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[#9CA3AF] transition hover:bg-[#F3F4F6] hover:text-[#6B7280]"
            onClick={handleModalClose}
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="relative w-[220px] shrink-0">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={searchValue}
              onChange={event => setSearchValue(event.currentTarget.value)}
              placeholder="Search..."
              className="h-10 w-full rounded-[8px] border border-[#D1D5DB] bg-white pl-9 pr-3 text-[14px] text-[#111827] outline-none transition focus:border-[#14B8A6]"
            />
          </label>

          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setManualUrlPopoverOpen(false);
                fileInputRef.current?.click();
              }}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[8px] bg-[#0D9488] px-4 text-[14px] font-semibold text-white transition hover:brightness-105"
            >
              <LuUpload className="h-3.5 w-3.5" />
              <span>Upload</span>
            </button>
            <button
              ref={manualUrlButtonRef}
              type="button"
              onClick={() => {
                setManualUrlPopoverOpen(previous => !previous);
              }}
              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-[8px] bg-[#0D9488] px-4 text-[14px] font-semibold text-white transition hover:brightness-105 ${
                manualUrlPopoverOpen
                  ? 'ring-2 ring-[#2563EB] ring-offset-0'
                  : ''
              }`}
            >
              <LuLink2 className="h-3.5 w-3.5" />
              <span>Add URL</span>
            </button>

            {manualUrlPopoverOpen ? (
              <div
                ref={manualUrlPopoverRef}
                className="absolute right-0 top-full z-[2] mt-2 flex items-center gap-2 rounded-[10px] border border-[#D1D5DB] bg-white p-2 shadow-[0_10px_28px_rgba(17,24,39,0.18)]"
              >
                <input
                  ref={manualUrlInputRef}
                  value={manualUrlDraft}
                  onChange={event => setManualUrlDraft(event.currentTarget.value)}
                  onKeyDown={event => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    submitManualUrl();
                  }}
                  placeholder="http://path/to/the/image."
                  className="h-9 w-[300px] rounded-[8px] border border-[#D1D5DB] px-3 text-[14px] text-[#111827] outline-none transition focus:border-[#14B8A6]"
                />
                <button
                  type="button"
                  disabled={!canSubmitManualUrl}
                  onClick={submitManualUrl}
                  className="inline-flex h-9 min-w-[88px] items-center justify-center rounded-[8px] bg-[#0D9488] px-4 text-[15px] font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;

            const fileReader = new FileReader();
            fileReader.onload = () => {
              const result = typeof fileReader.result === 'string'
                ? normalizeImageUrl(fileReader.result)
                : '';
              if (!result) return;
              setManualUrls(previous => (
                previous.includes(result) ? previous : [result, ...previous]
              ));
              onSelectImage(result);
            };
            fileReader.readAsDataURL(file);
            event.currentTarget.value = '';
          }}
        />

        <div className="mt-3 rounded-[10px] bg-[#F9FAFB] p-2">
          {filteredImageUrls.length === 0 ? (
            <div className="flex min-h-[132px] items-center justify-center rounded-[8px] border border-dashed border-[#D1D5DB] bg-white text-[13px] text-[#6B7280]">
              No images found in this session.
            </div>
          ) : (
            <div className="grid max-h-[360px] grid-cols-3 gap-2 overflow-auto">
              {filteredImageUrls.map((imageUrl, index) => {
                const isCurrent = imageUrl === currentImageUrl;
                return (
                  <div
                    key={`${imageUrl}-${index}`}
                    className={`group overflow-hidden rounded-[8px] border bg-white text-left transition ${
                      isCurrent
                        ? 'border-[#14B8A6] shadow-[0_0_0_1px_rgba(20,184,166,0.25)]'
                        : 'border-[#E5E7EB] hover:border-[#9CA3AF]'
                    }`}
                    title={imageUrl}
                  >
                    <div className="relative h-[84px] w-full overflow-hidden bg-[#E5E7EB]">
                      <img
                        src={imageUrl}
                        alt={toImageLabel(imageUrl, index)}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-[#0F172A]/22 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100" />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => onSelectImage(imageUrl)}
                          className="pointer-events-auto inline-flex h-9 min-w-[96px] items-center justify-center rounded-[10px] bg-[#0D9488] px-5 text-[14px] font-semibold text-white opacity-0 shadow-[0_8px_20px_rgba(15,23,42,0.25)] transition hover:brightness-105 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                    <div className="truncate px-2 py-1.5 text-[12px] text-[#374151]">
                      {toImageLabel(imageUrl, index)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
