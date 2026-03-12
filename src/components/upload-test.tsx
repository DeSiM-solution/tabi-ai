'use client';

import { useRef, useState, type ChangeEvent } from 'react';

export function UploadTest() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  const triggerFileDialog = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (!file) return;

    setIsUploading(true);
    setMessage(null);
    setPublicUrl(null);

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload-test', {
      method: 'POST',
      body: formData,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      path?: string;
      publicUrl?: string | null;
    };

    if (!response.ok) {
      setIsUploading(false);
      setMessage(`Upload failed: ${payload.error || 'Unknown error'}`);
      return;
    }

    setPublicUrl(payload.publicUrl ?? null);
    setIsUploading(false);
    setMessage(payload.path ? `Uploaded to ${payload.path}` : 'Upload complete.');
  };

  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={triggerFileDialog}
        disabled={isUploading}
        className="inline-flex h-11 items-center justify-center rounded-[12px] border border-border-light bg-bg-secondary px-5 text-[14px] font-semibold text-text-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isUploading ? 'Uploading...' : 'Upload Image'}
      </button>
      {message && (
        <p className="text-[12px] text-text-tertiary">{message}</p>
      )}
      {publicUrl && (
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[12px] font-medium text-accent-primary transition hover:opacity-80"
        >
          View Uploaded Image
        </a>
      )}
    </div>
  );
}
