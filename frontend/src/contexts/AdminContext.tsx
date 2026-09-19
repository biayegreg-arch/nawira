'use client';

import { createContext, useContext } from 'react';

export interface AdminIdentity {
  id: string;
  email: string;
  role: 'ADMIN' | 'SUPERADMIN';
  /** Capability hints from GET /api/admin/me — presentational only, every
   * mutating route re-checks role server-side regardless of this list. */
  can: string[];
}

export const AdminContext = createContext<AdminIdentity | null>(null);

/** Only used inside `/admin/*` — the layout guarantees a non-null identity
 * before rendering any child route. */
export function useAdmin(): AdminIdentity {
  const value = useContext(AdminContext);
  if (!value) {
    throw new Error('useAdmin() must be used within the /admin layout');
  }
  return value;
}
