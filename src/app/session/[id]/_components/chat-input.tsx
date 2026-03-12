import { LuSendHorizontal } from 'react-icons/lu';

type ChatInputProps = {
  value: string;
  inputError: string;
  isBusy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void | Promise<void>;
};

export function ChatInput({
  value,
  inputError,
  isBusy,
  onChange,
  onSubmit,
  onStop,
}: ChatInputProps) {
  return (
    <form
      className="border-t border-border-light bg-bg-elevated px-4 py-4"
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="w-full">
        <div className="flex items-center gap-3">
          <input
            id="chat-input"
            className="h-11 w-full rounded-[12px] border border-transparent bg-bg-secondary px-4 text-[14px] text-text-primary outline-none transition placeholder:text-text-tertiary focus:border-accent-primary focus:bg-bg-elevated"
            value={value}
            placeholder="Ask me to refine the guide..."
            onChange={event => onChange(event.currentTarget.value)}
          />
          {isBusy ? (
            <button
              type="button"
              onClick={() => void onStop()}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#D4D0CB] transition hover:brightness-95"
            >
              <span className="h-[14px] w-[14px] rounded-[2px] bg-[#9C968F]" aria-hidden />
              <span className="sr-only">Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent-primary text-text-inverse transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-border-default disabled:text-text-tertiary"
            >
              <LuSendHorizontal className="h-[18px] w-[18px]" />
              <span className="sr-only">Send</span>
            </button>
          )}
        </div>
        {inputError && <p className="mt-1 text-[11px] font-medium ui-text-error">{inputError}</p>}
      </div>
    </form>
  );
}
