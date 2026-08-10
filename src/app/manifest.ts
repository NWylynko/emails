import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Emails',
    start_url: '/',
    display: "standalone",
    icons: [
      {
        src: '/logo.png',
        sizes: '800x800',
        type: 'image/png',
      }
    ]
  }
}