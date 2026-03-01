import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: PageHeaderProps) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[20px] border border-white/[0.06] bg-[radial-gradient(circle_at_top_left,_rgba(252,114,255,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(123,97,255,0.12),_transparent_26%),#131416] p-7 sm:p-8">
      <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 max-w-2xl">
          {eyebrow ? (
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-[#fc72ff]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/50">{description}</p>
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
