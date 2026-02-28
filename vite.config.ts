import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // atualiza SW automaticamente
      includeAssets: [
        'favicon.ico',
        'robots.txt',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon.png' // Adicionado para garantir o cache do ícone adaptativo
      ],
      manifest: {
        name: 'Chegoou Delivery',
        short_name: 'Chegoou',
        description: 'Delivery da sua região',
        theme_color: '#EA1D2C',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any' // ESSENCIAL: Força o SO a usar este arquivo para o ícone da home
          },
          {
            src: 'maskable-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable' // Garante que o ícone preencha corretamente formas arredondadas/quadradas no Android
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json}'],
      },
      devOptions: {
        enabled: true 
      }
    })
  ],
});
