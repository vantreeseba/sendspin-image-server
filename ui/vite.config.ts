import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { themePrePaintScript } from './src/components/ui/theme-preference-base.ts';

// Applies the stored theme before first paint to avoid a flash, and carries a choice
// stored under the pre-cubeui key across.
function themePrePaint(): Plugin {
  return {
    name: 'cubeui-theme-pre-paint',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          children: themePrePaintScript({ legacyKeys: { theme: ['sendspin-theme'] } }),
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), themePrePaint()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
