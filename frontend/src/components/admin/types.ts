// Mirrors USER_SELECT in frontend/src/app/api/admin/users/route.ts and
// frontend/src/app/api/admin/users/[id]/route.ts — keep in sync.
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  emailVerifiedAt: string | null;
  createdAt: string;
  plan: 'FREE' | 'PLUS' | 'BABY';
  planExpiresAt: string | null;
}

export interface AdminUserListResponse {
  items: AdminUser[];
  nextCursor: string | null;
}
