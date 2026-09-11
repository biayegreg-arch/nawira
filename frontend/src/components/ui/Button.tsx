import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20',
  secondary: 'bg-white text-navy border border-border hover:bg-gray-50',
};

const sizes: Record<Size, string> = {
  // py-3 (not py-2.5) so the rendered height clears the 44px minimum
  // touch target (WCAG 2.5.5 / Apple HIG) at text-sm — measured 40px
  // before this change.
  md: 'px-5 py-3',
  lg: 'px-6 py-3.5',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

interface LinkButtonProps extends CommonProps {
  href: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  variant = 'primary',
  size = 'md',
  className,
  children,
  href,
}: LinkButtonProps): React.JSX.Element {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}
