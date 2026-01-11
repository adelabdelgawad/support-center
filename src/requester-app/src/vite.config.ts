import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import path from "path";
// PHASE 3: Bundle analyzer for monitoring bundle composition
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    solid(),
    // PHASE 3: Bundle analyzer - generates stats.html after build
    // View with: npm run build && open stats.html
    visualizer({
      filename: 'stats.html',
      open: false, // Set to true to auto-open after build
      gzipSize: true,
      brotliSize: true,
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Tauri expects a fixed port, fail if not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // Prevent vite from clearing the screen on build
  clearScreen: false,

  // Tauri env variables
  envPrefix: ["VITE_", "TAURI_"],

  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari14",
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,

    // ============================================================================
    // PHASE 2 OPTIMIZATIONS: Enhanced Build Configuration
    // ============================================================================

    // Code splitting and vendor chunking for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor code by framework/library for better caching
          'vendor-solid': ['solid-js', '@solidjs/router'],
          'vendor-query': ['@tanstack/solid-query'],
          'vendor-tauri': [
            '@tauri-apps/api',
            '@tauri-apps/plugin-notification',
            '@tauri-apps/plugin-store'
          ],
          'vendor-ui': ['lucide-solid', 'clsx', 'tailwind-merge'],
          'vendor-signalr': ['@microsoft/signalr'],
        },
      },
    },

    // Warn about large chunks (helps identify bloat)
    chunkSizeWarningLimit: 500, // KB

    // Enable CSS code splitting for better loading
    cssCodeSplit: true,

    // Minification options for production
    ...(process.env.TAURI_DEBUG ? {} : {
      minify: 'esbuild',
      // Additional esbuild options for better optimization
      esbuild: {
        drop: ['console', 'debugger'], // Remove console.logs and debuggers in production
        legalComments: 'none', // Remove comment headers to reduce size
      },
    }),
  },
});
