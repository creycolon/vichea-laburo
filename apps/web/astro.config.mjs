import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

// En local corre como servidor Node standalone; en Vercel usa su adapter.
// El build de Vercel define VERCEL=1 automáticamente.
const onVercel = Boolean(process.env.VERCEL) || process.env.DEPLOY_TARGET === 'vercel';

export default defineConfig({
  output: 'server',
  adapter: onVercel ? vercel() : node({ mode: 'standalone' }),
  server: { host: '127.0.0.1', port: 4321 },
  vite: { ssr: { noExternal: ['@supabase/ssr'] } },
});
