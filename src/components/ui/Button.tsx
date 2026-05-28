"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger" | "aiTools";
export type ButtonSize = "sm" | "md" | "lg";

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--abv-azure)] disabled:cursor-not-allowed disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--abv-ink)] text-white hover:bg-[#2a2a2a] shadow-sm",
  accent:
    "bg-[var(--abv-azure)] text-[var(--abv-ink)] hover:bg-[#5BCEFF] shadow-sm",
  outline:
    "bg-white text-[var(--abv-ink)] border-[1.5px] border-[var(--abv-ink)] hover:bg-[var(--abv-ink)] hover:text-white",
  ghost:
    "bg-transparent text-[var(--abv-text)]/70 hover:bg-[var(--abv-bg-warm)] hover:text-[var(--abv-ink)]",
  danger:
    "bg-[var(--abv-crimson)] text-white hover:opacity-90 shadow-sm",
  aiTools:
    "bg-[var(--abv-ai-tools)] text-white hover:bg-[var(--abv-ai-tools)]/90 shadow-sm",
};

function classes(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  extra?: string,
) {
  return [
    BASE,
    SIZES[size],
    VARIANTS[variant],
    fullWidth ? "w-full" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth = false,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes(variant, size, fullWidth, className)}
      {...rest}
    >
      {children}
    </button>
  );
});

interface LinkButtonProps extends BaseProps {
  href: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
  prefetch?: boolean;
  ariaLabel?: string;
}

export function LinkButton({
  href,
  target,
  rel,
  onClick,
  prefetch,
  ariaLabel,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
}: LinkButtonProps) {
  const cls = classes(variant, size, fullWidth, className);
  const isExternal = /^https?:\/\//i.test(href);
  if (isExternal) {
    return (
      <a
        href={href}
        target={target}
        rel={rel ?? (target === "_blank" ? "noopener noreferrer" : undefined)}
        onClick={onClick}
        aria-label={ariaLabel}
        className={cls}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cls}
    >
      {children}
    </Link>
  );
}
