import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // ensures relative asset paths
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  publicDir: 'public', // static files like audio, textures
});
