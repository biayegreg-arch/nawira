'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopBar } from '@/components/admin/AdminTopBar';
import { AdminMobileNav } from '@/components/admin/AdminMobileNav';
import { AdminContext, type AdminIdentity } from '@/contexts/AdminContext';

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
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Vérification de l&apos;accès…
      </div>
    );
  }

  return (
    <AdminContext.Provider value={identity}>
      <div className="flex" style={{ minHeight: '100vh' }}>
        <div className="hidden lg:flex">
          <AdminSidebar email={identity.email} role={identity.role} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopBar />
          <div className="lg:hidden">
            <AdminMobileNav />
          </div>
          <main className="flex-1 bg-background p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
