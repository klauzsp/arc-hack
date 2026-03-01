export function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
}) {
  const styles: Record<string, string> = {
    default: "bg-white/[0.08] text-white/60 ring-white/[0.10]",
    success: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20",
    warning: "bg-amber-500/15 text-amber-400 ring-amber-500/20",
    error:   "bg-red-500/15   text-red-400   ring-red-500/20",
    info:    "bg-[#fc72ff]/10 text-[#fc72ff] ring-[#fc72ff]/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${styles[variant]}`}>
      {children}
    </span>
  );
}
