import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
    alias: {
      '@': './src',
      '@multiplayer-base/shared-types': '../../libs/shared-types/src/index.ts'
    }
  }
};
