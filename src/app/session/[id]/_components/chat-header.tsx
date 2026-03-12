type ChatHeaderProps = {
  title: string;
  subtitle: string;
};

export function ChatHeader({ title, subtitle }: ChatHeaderProps) {
  return (
    <div className="border-b border-border-light px-5 pb-4 pt-5">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold leading-[1.35] text-text-primary">
          {title}
        </h1>
        <p className="mt-1 text-[12px] font-medium leading-4 text-text-tertiary">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
