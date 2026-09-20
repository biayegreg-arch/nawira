import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { PwaRegister } from '@/components/pwa/PwaRegister';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#6c43c1',
};

export const metadata: Metadata = {
  title: 'NAWIRA — Comprends ton corps. Vis ta vie sereinement.',
  description:
    "NAWIRA t'aide à suivre tes règles, comprendre les tendances de ton cycle et mieux connaître ta fertilité — une expérience simple, confidentielle, pensée pour les femmes africaines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={dmSans.variable}>
      <body className={`${dmSans.className} overflow-x-hidden`}>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
