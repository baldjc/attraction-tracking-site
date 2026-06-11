import { ReactNode } from "react";

interface PageHeaderProps {
  emoji: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
}

export default function PageHeader({ emoji, title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl leading-none shrink-0">{emoji}</span>
        <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-white flex-1">{title}</h1>
        {action}
      </div>
      {description && <p className="text-sm text-[var(--abv-text)]/55 dark:text-white/50">{description}</p>}
    </div>
  );
}
