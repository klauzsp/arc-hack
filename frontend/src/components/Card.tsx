export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-[20px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(19,20,22,0.98)_0%,rgba(16,17,20,0.98)_100%)] ${className}`}
    >
      {children}
    </div>
  );
}
