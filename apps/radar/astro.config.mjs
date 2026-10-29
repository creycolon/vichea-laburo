import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

const onVercel = Boolean(process.env.VERCEL) || process.env.DEPLOY_TARGET === 'vercel';

export default defineConfig({
  output: 'server',
  adapter: onVercel ? vercel() : node({ mode: 'standalone' }),
  server: { host: '127.0.0.1', port: 4322 },
});
