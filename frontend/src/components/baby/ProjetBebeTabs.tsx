import Link from 'next/link';

export type ProjetBebeTab = 'apercu' | 'calendrier' | 'ressources';

const TABS: Array<{ key: ProjetBebeTab; label: string; href: string }> = [
  { key: 'apercu', label: 'Aperçu', href: '/app/baby' },
  { key: 'calendrier', label: 'Calendrier de fertilité', href: '/app/baby/calendar' },
  { key: 'ressources', label: 'Ressources', href: '/app/baby/resources' },
];

interface ProjetBebeTabsProps {
  active: ProjetBebeTab;
}

export function ProjetBebeTabs({ active }: ProjetBebeTabsProps): React.JSX.Element {
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto overscroll-x-contain border-b border-border pb-4">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={
            active === t.key
              ? 'inline-flex min-h-11 shrink-0 items-center rounded-md bg-green-soft px-4 py-2 text-sm font-medium text-green'
              : 'inline-flex min-h-11 shrink-0 items-center rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-gray-50'
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
