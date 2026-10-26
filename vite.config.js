import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'icon-source.svg'],
      manifest: {
        name: '레버리지 매매일지',
        short_name: '매매일지',
        description: '매수단가·매도단가·비중·배율·마진 모드를 기록하고 승률·손익비·계좌손익을 추적하는 트레이딩 저널',
        theme_color: '#2a78d6',
        background_color: '#f9f9f7',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'ko',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallback: '/index.html'
      }
    })
  ]
});
