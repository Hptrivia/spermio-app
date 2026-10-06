/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

// Strict CSP, injected only into production builds (the dev server needs inline scripts).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  base: '/spermio-app/',
  plugins: [cspPlugin()],
  build: { rollupOptions: { input: { main: 'index.html', intake: 'intake.html' } } },
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version) },
  test: { environment: 'node', setupFiles: ['fake-indexeddb/auto'] },
});
