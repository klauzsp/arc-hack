import { Card } from "./Card";

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon?: string;
  trend?: { value: string; positive: boolean };
  valueClassName?: string;
}

function StatIcon({ d }: { d: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
      <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </div>
  );
}

export function StatCard({ label, value, subtitle, icon, trend, valueClassName }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${valueClassName ?? "text-slate-900"}`}>
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          )}
          {trend && (
            <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${trend.positive ? "text-emerald-600" : "text-red-600"}`}>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={trend.positive ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"} />
              </svg>
              {trend.value}
            </p>
          )}
        </div>
        {icon && <StatIcon d={icon} />}
      </div>
    </Card>
  );
}
