'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Camera, LogOut, Settings, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';
import { compressImageForUpload } from '@/lib/image-compress';
import { greetingName } from '@/lib/utils';
import { LogoutButton } from '@/components/app/LogoutButton';

// `api()` from `@/lib/api` always JSON.stringify()s its body and can't send
// FormData/multipart — avatar upload needs a raw fetch() to /api/upload, so
// CSRF has to be read manually here too (mirrors the private logic in
// lib/api.ts). This is the second deliberate raw-fetch exception alongside
// lib/assistant-chat.ts (SSE streaming) — see CLAUDE.md's api.ts note.
function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const name = `${COOKIE_PREFIX}-csrf`;
  const fromStorage = localStorage.getItem(name);
  if (fromStorage) return fromStorage;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export function UserMenu(): React.JSX.Element | null {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!user) return null;
  const name = greetingName(user.email);
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  async function onFileChange(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      // Phone photos routinely exceed the ~4.3MB hard ceiling Vercel places
      // on every serverless function's request body (not something the app
      // can raise) — downscale client-side first so a normal photo fits.
      const toUpload = await compressImageForUpload(file);

      const form = new FormData();
      form.append('file', toUpload);
      const csrfToken = readCsrfToken();
      const uploadRes = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: form,
      });
      if (!uploadRes.ok) {
        // A 413 past the platform's own body-size ceiling (still possible
        // for very large originals) never reaches our JSON-returning route
        // handler, so it has no `code` field to key off of — handle it by
        // status instead.
        if (uploadRes.status === 413) {
          toast('Cette image est trop grande, réessaie avec une autre photo.', 'error');
          return;
        }
        const body = (await uploadRes.json().catch(() => ({}))) as { code?: string };
        const map: Record<string, string> = {
          FILE_TOO_LARGE: 'Cette image est trop grande.',
          INVALID_MIME: 'Format d’image non supporté.',
          MAGIC_BYTE_MISMATCH: 'Ce fichier ne semble pas être une image valide.',
          STORAGE_NOT_CONFIGURED: "L'hébergement d'images n'est pas configuré.",
        };
        toast(map[body.code ?? ''] ?? 'Envoi de la photo impossible.', 'error');
        return;
      }
      const uploaded = (await uploadRes.json()) as { url: string };

      await api('/api/auth/me', {
        method: 'PATCH',
        body: { avatarUrl: uploaded.url },
      });
      await refresh();
      toast('Photo de profil mise à jour.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Envoi de la photo impossible.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void onFileChange(e)}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Mon compte"
        aria-expanded={open}
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-sm font-semibold text-primary"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          name.charAt(0)
        )}
      </button>

      {open && (
        <div className="animate-scale-in fixed inset-x-4 top-16 z-30 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-border bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-base font-semibold text-primary">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                name.charAt(0)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-navy">{name}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center min-h-11 gap-3 px-4 py-2.5 text-left text-sm text-navy hover:bg-gray-50 disabled:opacity-50"
          >
            <Camera size={16} />
            {uploading ? 'Envoi en cours…' : 'Changer la photo'}
          </button>

          <div className="border-t border-border py-1">
            <Link
              href="/app/profile"
              onClick={() => setOpen(false)}
              className="flex items-center min-h-11 gap-3 px-4 py-2.5 text-sm text-navy hover:bg-gray-50"
            >
              <UserIcon size={16} />
              Mon profil
            </Link>
            <Link
              href="/app/settings"
              onClick={() => setOpen(false)}
              className="flex items-center min-h-11 gap-3 px-4 py-2.5 text-sm text-navy hover:bg-gray-50"
            >
              <Settings size={16} />
              Paramètres
            </Link>
          </div>

          {isAdmin && (
            <div className="border-t border-border py-1">
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center min-h-11 gap-3 px-4 py-2.5 text-sm text-navy hover:bg-gray-50"
              >
                <ShieldCheck size={16} />
                Espace Admin
              </Link>
            </div>
          )}

          <div className="border-t border-border py-1">
            <LogoutButton className="flex w-full items-center min-h-11 gap-3 px-4 py-2.5 text-left text-sm text-navy hover:bg-gray-50">
              <LogOut size={16} />
              Déconnexion
            </LogoutButton>
          </div>
        </div>
      )}
    </div>
  );
}
