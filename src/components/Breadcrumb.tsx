"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/24/outline";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-4 overflow-x-auto scrollbar-hide">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="inline-flex items-center gap-1.5 shrink-0">
            {index > 0 && (
              <ChevronRightIcon className="w-3 h-3 text-[#2f3437]/30 dark:text-white/20" />
            )}
            {isLast || !item.href ? (
              <span className="text-[#2f3437]/70 dark:text-[#94a3b8] font-medium truncate max-w-[200px]">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-[#2f3437]/50 dark:text-[#94a3b8]/70 hover:text-[#6ba3c7] transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
