'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { LogoutButton } from '@/components/app/LogoutButton';
import { ADMIN_NAV } from './admin-nav';

function currentTitle(pathname: string): string {
  const match = [...ADMIN_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.label ?? 'Administration';
}

export function AdminTopBar(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-white px-4 py-3 lg:px-8 lg:py-4">
      <h1 className="min-w-0 text-lg font-bold leading-tight text-navy">
        {currentTitle(pathname)}
      </h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href="/app/today"
          className="inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground hover:text-navy"
        >
          Retour à l&apos;application
        </Link>
        <LogoutButton className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-navy hover:bg-gray-50">
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Déconnexion
        </LogoutButton>
      </div>
    </div>
  );
}
