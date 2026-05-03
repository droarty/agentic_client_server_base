import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';

const PORT = 4200;
const outdir = 'dist/apps/web';

mkdirSync(outdir, { recursive: true });
copyFileSync('apps/web/index.html', join(outdir, 'index.html'));

// Run Tailwind CSS in watch mode alongside esbuild
const tailwind = spawn(
  'pnpm',
  [
    'tailwindcss',
    '-i', 'apps/web/src/app/styles/global.css',
    '-o', `${outdir}/styles.css`,
    '--watch',
    '--config', 'apps/web/tailwind.config.js',
  ],
  { stdio: 'inherit' }
);
tailwind.on('error', (err) => console.error('Tailwind error:', err));

const ctx = await esbuild.context({
  entryPoints: ['apps/web/src/main.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  sourcemap: true,
  outdir,
  alias: {
    '@': resolve('apps/web/src'),
  },
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
