'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/contexts/AuthContext';
import { SyncStatusProvider } from '@/contexts/SyncStatusContext';
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
    <SyncStatusProvider>
      <div className="flex min-h-dvh">
        <div className="hidden lg:flex">
          <AppSidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopBar />
          <main className="min-w-0 flex-1 bg-background pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
            {children}
          </main>
        </div>
        <div className="lg:hidden">
          <MobileBottomNav />
        </div>
      </div>
    </SyncStatusProvider>
  );
}
