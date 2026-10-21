import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  base: '/axiom-chat/',
  plugins: [react(), tailwindcss()],
  define: { __LOCAL_PROVIDER_RELAY__: 'false' },
  build: { rollupOptions: { output: { manualChunks(id) {
    if (/[/\\]node_modules[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return 'react-vendor';
  } } } },
});
