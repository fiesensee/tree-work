import { defineConfig } from 'vite';

// Keep the optional standalone web build separate from the Obsidian package.
export default defineConfig({ build: { outDir: 'dist/web' } });
