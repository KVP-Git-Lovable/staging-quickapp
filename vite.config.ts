import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mcpPlugin(),
    mode === 'development' &&

    componentTagger(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      injectManifest: {
        globPatterns: [
          '**/*.{html,js,mjs,css,woff,woff2,ttf,eot,ico,png,jpg,jpeg,svg,gif,webp,json,txt}',
        ],
        globIgnores: [
          '**/node_modules/**/*',
          '**/*.map',
          '**/lovable-uploads/**/*',
        ],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
      },
      manifest: {
        name: 'QuickApp',
        short_name: 'QuickApp',
        description: 'AI-powered field sales platform for modern commerce',
        theme_color: '#007BFF',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/app-icon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/app-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
        ],
      },
      devOptions: {
        enabled: false,
        type: 'module',
        navigateFallback: 'index.html'
      },
      includeAssets: ['icons/app-icon.png'],
      injectRegister: null,
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Prevent "Invalid hook call" caused by multiple React copies in the bundle
    dedupe: ["react", "react-dom"],
  },
}));
