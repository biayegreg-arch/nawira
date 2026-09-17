// Explicit React import required here: this file runs standalone via
// `tsx` (esbuild's classic JSX transform, since tsconfig.json's
// `"jsx": "preserve"` is meant for Next's own SWC bundler, not esbuild)
// — without it, `React.createElement` is undefined at runtime and the
// script throws `ReferenceError: React is not defined`. Verified by
// running this exact script standalone before finalizing this plan.
import React from 'react';
import { ImageResponse } from 'next/og';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public/icons');

interface IconSpec {
  file: string;
  size: number;
  /** Maskable icons need ~10% safe-zone padding so OS icon masks don't clip the symbol. */
  padding: number;
}

const ICONS: IconSpec[] = [
  { file: 'icon-192.png', size: 192, padding: 0 },
  { file: 'icon-512.png', size: 512, padding: 0 },
  { file: 'icon-512-maskable.png', size: 512, padding: 51 }, // ~10% of 512
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const icon of ICONS) {
    const inner = icon.size - icon.padding * 2;
    const response = new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#6c43c1',
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Droplet symbol — matches the existing sidebar branding
                (frontend/src/components/app/AppSidebar.tsx uses
                lucide-react's Droplet icon). PLACEHOLDER: replace with a
                real brand asset before public launch. */}
          <svg width={inner} height={inner} viewBox="0 0 24 24" fill="#ffffff">
            <path d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-13-7-13z" />
          </svg>
        </div>
      </div>,
      { width: icon.size, height: icon.size },
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(join(OUT_DIR, icon.file), buffer);
    console.log(`wrote ${icon.file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
