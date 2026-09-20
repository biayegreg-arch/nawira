'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ChangeEvent } from 'react';
import { ADMIN_NAV } from './admin-nav';

// Back-office nav is desktop-primary (AdminSidebar, shown at lg:+), but must
// still work below 1024px per the mobile-first rule — a single <select> is
// the simplest correct substitute for a 8-item vertical nav at 375px,
// matching the "no horizontal scroll, no fake affordance" bar the rest of
// this codebase holds to.
export function AdminMobileNav(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();

  const current = ADMIN_NAV.find(
    (item) => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href)),
  );

  function onChange(e: ChangeEvent<HTMLSelectElement>): void {
    router.push(e.target.value);
  }

  return (
    <div className="border-b border-border bg-white px-4 py-3">
      <select
        value={current?.href ?? '/admin'}
        onChange={onChange}
        className="min-h-11 w-full rounded-lg border border-border px-3.5 py-3 text-base text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      >
        {ADMIN_NAV.map((item) => (
          <option key={item.href} value={item.href} disabled={!item.available}>
            {item.label}
            {!item.available ? ' (bientôt disponible)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
