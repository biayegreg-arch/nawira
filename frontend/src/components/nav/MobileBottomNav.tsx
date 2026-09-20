'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, Calendar, Home, PlusCircle, User, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: '/app/today', label: 'Accueil', icon: Home },
  { href: '/app/calendar', label: 'Calendrier', icon: Calendar },
  { href: '/app/log', label: 'Saisir', icon: PlusCircle },
  { href: '/app/insights', label: 'Analyses', icon: BarChart2 },
  { href: '/app/profile', label: 'Profil', icon: User },
];

export function MobileBottomNav(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
      <div className="mx-auto flex max-w-screen-sm justify-around">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 py-1"
              aria-current={active ? 'page' : undefined}
            >
              <item.icon size={22} className={active ? 'text-primary' : 'text-muted-light'} />
              <span
                className={cn(
                  'text-xs',
                  active ? 'font-semibold text-primary' : 'font-normal text-muted-light',
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
