'use client';

import { useState } from 'react';
import { Activity, Menu, X } from 'lucide-react';
import { LinkButton } from '@/components/ui/Button';

const navLinks = [
  { label: 'Accueil', href: '/' },
  { label: 'Fonctionnalités', href: '#fonctionnalites' },
  { label: 'Pourquoi NAWIRA ?', href: '#pourquoi' },
  { label: 'Avis', href: '#avis' },
];

export function LandingNav(): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <nav className="w-full border-b border-border bg-white">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between px-4 py-4 sm:px-6 lg:px-12">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
            <Activity className="h-4 w-4 text-white" />
          </span>
          <span className="font-headings text-xl font-bold text-navy">NAWIRA</span>
        </a>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-8 lg:flex">
          {navLinks.map((item) => (
            <a key={item.label} href={item.href} className="text-sm font-medium text-body">
              {item.label}
            </a>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 lg:flex">
          <LinkButton href="/login" variant="secondary">
            Se connecter
          </LinkButton>
          <LinkButton href="/signup" variant="primary">
            Commencer gratuitement
          </LinkButton>
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border lg:hidden"
        >
          {open ? <X className="h-5 w-5 text-navy" /> : <Menu className="h-5 w-5 text-navy" />}
        </button>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div className="border-t border-border px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-50"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <LinkButton href="/login" variant="secondary" className="w-full">
              Se connecter
            </LinkButton>
            <LinkButton href="/signup" variant="primary" className="w-full">
              Commencer gratuitement
            </LinkButton>
          </div>
        </div>
      )}
    </nav>
  );
}
