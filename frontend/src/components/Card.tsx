export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-[28px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(19,20,22,0.98)_0%,rgba(16,17,20,0.98)_100%)] shadow-[0_24px_60px_-36px_rgba(0,0,0,0.75)] ${className}`}
    >
      {children}
    </div>
  );
}
