'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

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
];

export function AppSidebar(): React.JSX.Element {
  const pathname = usePathname();
  const { logout } = useAuth();

  const isActive = (href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex w-64 shrink-0 flex-col bg-gradient-to-b from-sidebar-from to-sidebar-to">
      <div className="px-6 pt-8 pb-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/15">
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
              <circle
                cx="17"
                cy="17"
                r="16"
                stroke="white"
                strokeWidth="1.5"
                fill="none"
                opacity="0.3"
              />
              <path
                d="M17 6 C17 6, 22 10, 22 17 C22 24, 17 28, 17 28 C17 28, 12 24, 12 17 C12 10, 17 6, 17 6Z"
                fill="white"
                opacity="0.9"
              />
              <path
                d="M6 17 C6 17, 10 12, 17 12 C24 12, 28 17, 28 17 C28 17, 24 22, 17 22 C10 22, 6 17, 6 17Z"
                fill="white"
                opacity="0.5"
              />
              <circle cx="17" cy="17" r="3" fill="white" />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold tracking-widest text-white">NAWIRA</div>
            <div className="mt-0.5 text-[10px] leading-tight text-white/65">
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

        <div className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider text-white/45 uppercase">
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
        <button
          type="button"
          onClick={() => void logout()}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white/65"
        >
          <LogOut size={16} />
          <span>Déconnexion</span>
        </button>
      </nav>

      <div className="relative m-3 overflow-hidden rounded-xl bg-white/10 p-4">
        <div className="text-sm leading-snug font-semibold text-white">
          Chaque étape de ta vie compte.
        </div>
      </div>
    </div>
  );
}
