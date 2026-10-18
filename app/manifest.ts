import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stonebook',
    short_name: 'Stonebook',
    description: 'The Black Wolf Farm family logbook',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4efe4',
    theme_color: '#2f5a39',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
