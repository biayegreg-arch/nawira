'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopBar } from '@/components/admin/AdminTopBar';
import { AdminMobileNav } from '@/components/admin/AdminMobileNav';
import { AdminContext, type AdminIdentity } from '@/contexts/AdminContext';
import { Skeleton } from '@/components/ui/Skeleton';

interface AdminMeResponse {
  admin: { id: string; email: string; role: 'ADMIN' | 'SUPERADMIN' };
  can: string[];
}

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element | null {
  const router = useRouter();
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<AdminMeResponse>('/api/admin/me');
        if (!cancelled) setIdentity({ ...res.admin, can: res.can });
      } catch {
        // 401/403 (not an admin) or any other failure — fail safe, deny access.
        if (!cancelled) router.replace('/');
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checked || !identity) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-64 shrink-0 flex-col gap-2 bg-gradient-to-b from-sidebar-from to-sidebar-to p-4 lg:flex">
          <Skeleton className="mx-auto mb-6 mt-4 h-14 w-14 rounded-xl bg-white/15" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full bg-white/10" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border bg-white px-4 py-4 lg:px-8">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
          <main className="flex flex-1 flex-col gap-6 bg-background p-4 sm:p-6 lg:p-8">
            <Skeleton className="h-4 w-56" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={identity}>
      <div className="flex min-h-dvh">
        <div className="hidden lg:flex">
          <AdminSidebar email={identity.email} role={identity.role} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopBar />
          <div className="lg:hidden">
            <AdminMobileNav />
          </div>
          <main className="min-w-0 flex-1 bg-background p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
