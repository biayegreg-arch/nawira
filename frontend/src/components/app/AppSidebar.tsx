'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import {
  Home,
  Calendar,
  PlusCircle,
  BarChart2,
  Leaf,
  MessageCircle,
  User,
  Settings,
  Crown,
  HelpCircle,
  LifeBuoy,
  LogOut,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { LogoutButton } from './LogoutButton';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: '/app/today', label: "Aujourd'hui", icon: Home },
  { href: '/app/calendar', label: 'Calendrier', icon: Calendar },
  { href: '/app/log', label: 'Ajouter des données', icon: PlusCircle },
  { href: '/app/insights', label: 'Analyses', icon: BarChart2 },
  { href: '/app/baby', label: 'Projet Bébé', icon: Leaf },
  { href: '/app/assistant', label: 'Assistant NAWIRA', icon: MessageCircle },
];

const accountItems: NavItem[] = [
  { href: '/app/profile', label: 'Profil', icon: User },
  { href: '/app/settings', label: 'Paramètres', icon: Settings },
  { href: '/app/billing', label: 'Abonnement', icon: Crown },
  { href: '/app/help', label: "Centre d'aide", icon: HelpCircle },
  { href: '/app/support', label: 'Mes demandes', icon: LifeBuoy },
];

export function AppSidebar(): React.JSX.Element {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  const isActive = (href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex w-64 shrink-0 flex-col bg-gradient-to-b from-sidebar-from to-sidebar-to">
      <div className="px-6 pt-8 pb-6">
        <div className="flex flex-col items-center gap-2">
          <Logo size={56} />
          <div className="text-center">
            <div className="text-xl font-bold tracking-widest text-white">NAWIRA</div>
            <div className="mt-0.5 text-xs leading-tight text-white/65">
              Comprends ton corps.
              <br />
              Vis ta vie sereinement.
            </div>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                active ? 'bg-white/[0.18] font-semibold text-white' : 'text-white/70',
              )}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wider text-white/45 uppercase">
          Mon compte
        </div>
        {accountItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                active ? 'font-semibold text-white' : 'text-white/65',
              )}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {isAdmin && (
          <>
            <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wider text-white/45 uppercase">
              Administration
            </div>
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                isActive('/admin') ? 'bg-white/[0.18] font-semibold text-white' : 'text-white/70',
              )}
            >
              <ShieldCheck size={18} />
              <span>Espace Admin</span>
            </Link>
          </>
        )}

        <LogoutButton className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white/65">
          <LogOut size={16} />
          <span>Déconnexion</span>
        </LogoutButton>
      </nav>

      <div className="relative m-3 overflow-hidden rounded-xl bg-white/10 p-4">
        <div className="text-sm leading-snug font-semibold text-white">
          Chaque étape de ta vie compte.
        </div>
      </div>
    </div>
  );
}
