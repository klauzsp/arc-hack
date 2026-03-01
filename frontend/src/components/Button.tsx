"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "success"
  | "danger"
  | "ghost";

export type ButtonSize = "sm" | "md" | "lg";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
};

const baseStyles =
  "inline-flex items-center justify-center gap-2 rounded-full border font-semibold tracking-[-0.01em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc72ff]/35";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[linear-gradient(135deg,#ff7bf3_0%,#fc72ff_38%,#8b5cf6_100%)] text-[#111216] shadow-[0_18px_30px_-18px_rgba(252,114,255,0.9)] hover:scale-[1.01] hover:brightness-105",
  secondary:
    "border-white/[0.08] bg-[#1a1b1f] text-white hover:border-white/[0.14] hover:bg-[#202127]",
  outline:
    "border-white/[0.12] bg-transparent text-white/78 hover:border-white/[0.18] hover:bg-white/[0.04] hover:text-white",
  success:
    "border-emerald-500/20 bg-emerald-500 text-white shadow-[0_18px_30px_-18px_rgba(16,185,129,0.85)] hover:scale-[1.01] hover:brightness-105",
  danger:
    "border-red-500/18 bg-red-500/12 text-red-300 hover:border-red-500/28 hover:bg-red-500/18",
  ghost:
    "border-transparent bg-white/[0.05] text-white/72 hover:bg-white/[0.08] hover:text-white",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export function buttonStyles({
  variant = "secondary",
  size = "md",
  block = false,
  className = "",
}: ButtonStyleOptions = {}) {
  return [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    block ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, block, className })}
      {...props}
    >
      {children}
    </button>
  );
}
