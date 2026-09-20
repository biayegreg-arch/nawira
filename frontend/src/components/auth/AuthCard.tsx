import Link from 'next/link';
import { Activity } from 'lucide-react';
import { type ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps): React.JSX.Element {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-6 flex min-h-11 items-center justify-center gap-2 sm:mb-8">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
            <Activity className="h-4 w-4 text-white" />
          </span>
          <span className="font-headings text-xl font-bold text-navy">NAWIRA</span>
        </Link>

        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8">
          <h1 className="font-headings text-xl font-bold text-navy md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
