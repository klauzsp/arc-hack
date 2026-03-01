export function StatCard({
  label,
  value,
  subtitle,
  icon,
  trend,
  valueClassName,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon?: string;
  trend?: { value: string; positive: boolean };
  valueClassName?: string;
}) {
  return (
    <div className="flex min-h-[132px] flex-col justify-between rounded-[28px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(19,20,22,0.98)_0%,rgba(15,16,18,0.98)_100%)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">{label}</p>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05]">
            <svg className="h-4 w-4 text-white/35" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
        )}
      </div>

      <div>
        <p
          className={`text-[28px] font-semibold leading-none tabular-nums tracking-tight ${valueClassName ?? "text-white"}`}
          title={value}
        >
          {value}
        </p>
        {(subtitle || trend) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {subtitle && (
              <p className="text-[12px] leading-5 text-white/42">{subtitle}</p>
            )}
            {trend && (
              <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-semibold ${trend.positive ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={trend.positive ? "M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" : "M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"} />
                </svg>
                {trend.value}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
