import Link from 'next/link';
import { type LucideIcon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionLinkCardProps {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
}

export function SectionLinkCard({
  href,
  label,
  description,
  icon: Icon,
  available,
}: SectionLinkCardProps): React.JSX.Element {
  const content = (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border border-border bg-card p-5',
        available ? 'transition-shadow hover:shadow-md' : 'opacity-60',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
        <Icon className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-navy">{label}</div>
        <p className="truncate text-xs text-muted-foreground">
          {available ? description : 'Bientôt disponible'}
        </p>
      </div>
      {available && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );

  if (!available) {
    return <div aria-disabled="true">{content}</div>;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
