import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NAWIRA',
    short_name: 'NAWIRA',
    description: 'Comprends ton corps. Vis ta vie sereinement.',
    start_url: '/app/today',
    display: 'standalone',
    background_color: '#fdfbfd',
    theme_color: '#6c43c1',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
