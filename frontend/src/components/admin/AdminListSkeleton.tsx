import { Skeleton } from '@/components/ui/Skeleton';

interface AdminListSkeletonProps {
  rows?: number;
}

export function AdminListSkeleton({ rows = 6 }: AdminListSkeletonProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="hidden h-5 w-20 shrink-0 rounded-full sm:block" />
          <Skeleton className="hidden h-5 w-20 shrink-0 rounded-full md:block" />
        </div>
      ))}
    </div>
  );
}
