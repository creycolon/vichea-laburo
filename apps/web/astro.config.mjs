import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// SSR con adapter de Node: necesitamos cookies y sesión en el servidor.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: '127.0.0.1', port: 4321 },
  vite: { ssr: { noExternal: ['@supabase/ssr'] } },
});
