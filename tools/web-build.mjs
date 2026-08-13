import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const outdir = 'dist/apps/web';
const isDev = process.argv.includes('--dev');

mkdirSync(outdir, { recursive: true });
copyFileSync('apps/web/index.html', `${outdir}/index.html`);

execSync(
  `pnpm postcss apps/web/src/app/styles/global.css -o ${outdir}/styles.css --config apps/web/postcss.config.js`,
  { stdio: 'inherit' }
);

// A declarative esbuild executor's `define` is static JSON — it can't read live
// process.env, which is exactly why apps/web's "production" build used to bake
// in a hardcoded localhost URL. This script reads real deploy-time env vars
// (API_URL, WS_URL) so `nx build web` can target a real environment.
await esbuild.build({
  entryPoints: ['apps/web/src/main.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  outdir,
  minify: !isDev,
  sourcemap: isDev,
  alias: {
    '@': resolve('apps/web/src'),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
    'process.env.API_URL': JSON.stringify(process.env.API_URL || 'http://localhost:3000'),
    'process.env.WS_URL': JSON.stringify(process.env.WS_URL || 'ws://localhost:3000'),
  },
});

console.log(`Web build complete → ${outdir}`);
