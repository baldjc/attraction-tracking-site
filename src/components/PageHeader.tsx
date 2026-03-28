import { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

interface PageHeaderProps {
  icon: IconComponent;
  title: string;
  description: string;
  colour: string;
}

export default function PageHeader({ icon: Icon, title, description, colour }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="p-2 rounded-lg shrink-0"
          style={{ backgroundColor: `${colour}1a` }}
        >
          <Icon className="w-5 h-5" style={{ color: colour }} />
        </div>
        <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">{title}</h1>
      </div>
      <p className="text-sm text-[#2f3437]/55 dark:text-white/50 pl-0">{description}</p>
    </div>
  );
}
