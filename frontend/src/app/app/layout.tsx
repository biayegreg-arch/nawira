'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/app/AppSidebar';
import { AppTopBar } from '@/components/app/AppTopBar';
import { MobileBottomNav } from '@/components/nav/MobileBottomNav';

export default function AppLayout({ children }: { children: ReactNode }): React.JSX.Element | null {
  const router = useRouter();
  const user = useUser(); // redirects to /login if logged out; returns null while loading/redirecting

  useEffect(() => {
    if (user && !user.hasProfile) {
      router.replace('/onboarding/welcome');
    }
  }, [user, router]);

  if (!user || !user.hasProfile) return null;

  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      <div className="hidden lg:flex">
        <AppSidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopBar />
        <main className="flex-1 bg-background pb-20 lg:pb-0">{children}</main>
      </div>
      <div className="lg:hidden">
        <MobileBottomNav />
      </div>
    </div>
  );
}
