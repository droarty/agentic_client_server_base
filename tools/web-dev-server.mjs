import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const PORT = 4200;
const outdir = 'dist/apps/web';

mkdirSync(outdir, { recursive: true });
copyFileSync('apps/web/index.html', join(outdir, 'index.html'));

const ctx = await esbuild.context({
  entryPoints: ['apps/web/src/main.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  sourcemap: true,
  outdir,
  define: {
    'process.env.NODE_ENV': '"development"',
    'process.env.API_URL': '"http://localhost:3000"',
  },
});

await ctx.watch();

const { host, port } = await ctx.serve({
  servedir: outdir,
  port: PORT,
  fallback: join(outdir, 'index.html'),
});

console.log(`Web dev server running at http://${host}:${port}`);
