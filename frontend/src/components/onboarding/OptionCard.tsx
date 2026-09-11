import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface OptionCardProps {
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  title: string;
  description?: string;
}

export function OptionCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: OptionCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150 active:scale-[0.98]',
        selected ? 'border-primary bg-primary-soft' : 'border-border bg-white hover:bg-gray-50',
      )}
    >
      {icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
          {icon}
        </span>
      )}
      <span className="flex flex-col">
        <span className="font-medium text-navy">{title}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}
