import { LuLoaderCircle } from 'react-icons/lu';

type SessionLoadingOverlayProps = {
  label: string;
};

export function SessionLoadingOverlay({ label }: SessionLoadingOverlayProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-text-primary">
          <span className="font-japanese text-[34px] font-semibold leading-none text-text-inverse">
            旅
          </span>
        </div>
        <div className="relative h-5 w-5">
          <LuLoaderCircle className="absolute inset-0 h-5 w-5 animate-spin text-accent-primary" />
        </div>
        <p className="text-[16px] font-medium text-text-secondary">{label}</p>
      </div>
    </div>
  );
}
