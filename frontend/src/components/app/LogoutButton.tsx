'use client';

import { useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LogoutModal } from './LogoutModal';

interface LogoutButtonProps {
  className?: string;
  children: ReactNode;
}

/** Wraps any trigger content with the shared logout-confirmation modal — used by AppSidebar (desktop) and the Profile page's mobile account-links block. */
export function LogoutButton({ className, children }: LogoutButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const { logout, loggingOut } = useAuth();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <LogoutModal
        open={open}
        loading={loggingOut}
        onCancel={() => setOpen(false)}
        onConfirm={() => void logout()}
      />
    </>
  );
}
