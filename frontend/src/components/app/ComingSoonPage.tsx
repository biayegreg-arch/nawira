import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface ComingSoonPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoonPage({
  icon: Icon,
  title,
  description,
}: ComingSoonPageProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-4 py-16 text-center sm:py-24 lg:p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon size={28} />
      </div>
      <h1 className="text-xl font-bold text-navy md:text-2xl">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <Link
        href="/app/today"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
      >
        Retour à l&rsquo;accueil
      </Link>
    </div>
  );
}
