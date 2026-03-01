export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#131416] ${className}`}>
      {children}
    </div>
  );
}
