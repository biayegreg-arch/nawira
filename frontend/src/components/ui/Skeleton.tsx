import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

/** Shimmering placeholder block — never a spinner/text loader. */
export function Skeleton({ className }: SkeletonProps): React.JSX.Element {
  return <div aria-hidden="true" className={cn('animate-shimmer rounded-md', className)} />;
}
