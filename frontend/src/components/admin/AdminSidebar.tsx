'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV } from './admin-nav';

interface AdminSidebarProps {
  email: string;
  role: 'ADMIN' | 'SUPERADMIN';
}

export function AdminSidebar({ email, role }: AdminSidebarProps): React.JSX.Element {
  const pathname = usePathname();

  const isActive = (href: string): boolean =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  return (
    <div className="flex w-64 shrink-0 flex-col bg-gradient-to-b from-sidebar-from to-sidebar-to">
      <div className="px-6 pt-8 pb-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/15">
            <ShieldCheck className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
          <div className="text-center">
            <div className="text-xl font-bold tracking-widest text-white">NAWIRA</div>
            <div className="mt-0.5 text-[10px] leading-tight text-white/65">Administration</div>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {ADMIN_NAV.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          if (!item.available) {
            return (
              <span
                key={item.href}
                className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2.5 text-sm text-white/35"
                title="Bientôt disponible"
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                <span>{item.label}</span>
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm',
                active
                  ? 'bg-white/[0.18] font-semibold text-white'
                  : 'text-white/72 hover:bg-white/10',
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-6 py-4">
        <p className="truncate text-xs font-medium text-white">{email}</p>
        <p className="text-[11px] text-white/55">{role}</p>
      </div>
    </div>
  );
}
