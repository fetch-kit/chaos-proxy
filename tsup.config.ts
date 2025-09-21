import { defineConfig } from 'tsup';

import type { Plugin } from 'esbuild';

const rewriteTsImports: Plugin = {
  name: 'rewrite-ts-imports',
  setup(build) {
    build.onEnd(result => {
      if (result.outputFiles) {
        result.outputFiles = result.outputFiles.map(file => {
          return {
            ...file,
            text: file.text.replace(/(from\s+['"])(\.\/.*?)(\.ts)(['"])/g, '$1$2.js$4')
          };
        });
      }
    });
  }
};

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  shims: true,
  splitting: false,
  minify: false,
  esbuildPlugins: [rewriteTsImports],
});
