import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Replit injects PORT and BASE_PATH and runs the dev server; Vercel only runs
// `vite build`, without either variable. The dev/preview server still requires
// PORT, and Replit-only plugins load only inside a Replit workspace (REPL_ID).
const onReplit = process.env.REPL_ID !== undefined;

function requiredPort(): number {
  const rawPort = process.env.PORT;
  if (!rawPort) {
    throw new Error(
      'PORT environment variable is required but was not provided.',
    );
  }
  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  return port;
}

export default defineConfig(async ({ command }) => {
  const port = command === 'build' ? undefined : requiredPort();
  const basePath = process.env.BASE_PATH || '/';

  return {
    base: basePath,
    // Replit's published proxy caps response size, so videos stream through
    // the API's bounded range route there. Vercel's CDN serves the same files
    // from /videos/ with full range support, so Vercel builds use them directly.
    define: {
      'import.meta.env.VITE_PUBLIC_VIDEO_SOURCE': JSON.stringify(
        process.env.VERCEL ? 'static' : 'api',
      ),
    },
    plugins: [
      react(),
      tailwindcss(),
      ...(onReplit
        ? [
            await import('@replit/vite-plugin-runtime-error-modal').then((m) =>
              m.default(),
            ),
          ]
        : []),
      ...(process.env.NODE_ENV !== 'production' && onReplit
        ? [
            await import('@replit/vite-plugin-cartographer').then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, '..'),
              }),
            ),
            await import('@replit/vite-plugin-dev-banner').then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@assets': path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'attached_assets',
        ),
      },
      dedupe: ['react', 'react-dom'],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
