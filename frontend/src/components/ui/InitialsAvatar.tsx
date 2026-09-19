import { cn } from '@/lib/utils';

// Deterministic initials-only avatar — no photo, no fabricated demographic
// data (gender/heritage/age), unlike Banani's fake `UserAvatar` generator.
function initialsFrom(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[1]?.[0] : undefined;
  return (first + (second ?? '')).toUpperCase();
}

// Small deterministic hue spread so distinct users get distinct (but stable)
// colors without any per-user identity data being fabricated.
const PALETTE = [
  'bg-primary-soft text-primary',
  'bg-green-soft text-green',
  'bg-amber-soft text-amber',
  'bg-rose-soft text-rose',
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] as string;
}

interface InitialsAvatarProps {
  name: string | null;
  email: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function InitialsAvatar({
  name,
  email,
  size = 'md',
  className,
}: InitialsAvatarProps): React.JSX.Element {
  const initials = initialsFrom(name, email);
  const dims = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        dims,
        colorFor(email),
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
