'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, PartyPopper, Wallet, CreditCard, CheckCheck, LifeBuoy } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/time-ago';
import { notificationHref } from '@/lib/notification-target';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  data?: unknown;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  WELCOME: PartyPopper,
  PAYMENT_RECEIVED: CreditCard,
  WITHDRAWAL_REQUESTED: Wallet,
  SUPPORT_TICKET_REPLIED: LifeBuoy,
};

export function NotificationBell(): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await api<{ count: number }>('/api/notifications/count');
      setCount(res.count);
    } catch {
      // Badge is best-effort — a failed count fetch shouldn't surface an error UI.
    }
  }, []);

  const loadList = useCallback(async () => {
    setError(false);
    try {
      const res = await api<{ items: NotificationItem[] }>('/api/notifications?limit=10');
      setItems(res.items);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void loadCount();
  }, [loadCount]);

  useEffect(() => {
    if (open && items === null) void loadList();
  }, [open, items, loadList]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const markRead = useCallback(async (ids: string[] | 'all') => {
    try {
      const res = await api<{ unreadCount: number }>('/api/notifications', {
        method: 'PATCH',
        body: { ids },
      });
      setCount(res.unreadCount);
      setItems((prev) =>
        prev === null
          ? prev
          : prev.map((n) =>
              ids === 'all' || ids.includes(n.id)
                ? { ...n, readAt: n.readAt ?? new Date().toISOString() }
                : n,
            ),
      );
    } catch {
      // Best-effort — the item stays unread visually if this fails, no toast noise for a minor action.
    }
  }, []);

  const handleItemClick = (item: NotificationItem): void => {
    if (!item.readAt) void markRead([item.id]);
    const href = notificationHref(item.type, item.data);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center text-navy"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose px-1 text-xs font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-scale-in fixed inset-x-4 top-16 z-20 rounded-xl border border-border bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold text-navy">Notifications</h3>
            {count > 0 && (
              <button
                type="button"
                onClick={() => void markRead('all')}
                className="flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-primary"
              >
                <CheckCheck size={12} />
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="max-h-[60dvh] overflow-y-auto sm:max-h-96">
            {error && (
              <p className="p-4 text-center text-sm text-red-700">
                Impossible de charger tes notifications.
              </p>
            )}
            {!error && items === null && (
              <div className="flex flex-col gap-2 p-4">
                <div className="h-12 animate-pulse rounded-lg bg-gray-100" />
                <div className="h-12 animate-pulse rounded-lg bg-gray-100" />
              </div>
            )}
            {!error && items !== null && items.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Aucune notification pour l&rsquo;instant.
              </p>
            )}
            {!error &&
              items !== null &&
              items.map((item) => {
                const Icon = TYPE_ICONS[item.type] ?? Bell;
                const unread = !item.readAt;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`flex w-full items-start gap-3 border-b border-border p-4 text-left last:border-0 ${
                      unread ? 'bg-primary-soft/40' : 'bg-white'
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 break-words text-sm font-semibold text-navy">
                          {item.title}
                        </span>
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-rose" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.body}
                      </p>
                      <span className="mt-1 block text-xs text-muted-light">
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
