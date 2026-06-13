import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['cjs', 'esm'],
  target: 'node18',
  clean: true,
  sourcemap: true,
  dts: false,
  shims: true,
  // Bundle workspace deps. @driftlog/types ships extensionless ESM imports
  // (./plans, not ./plans.js) which Node's strict ESM resolver rejects.
  // Bundling sidesteps that and avoids the user having to install a loader.
  // Keep heavy native deps external so we don't try to inline tree-sitter.
  // Bundle @driftlog/parser and @driftlog/types so the published CJS does not
  // hit the workspace types package's extensionless ESM imports. Keep the
  // native tree-sitter packages external -- their .node prebuilds must be
  // loaded at runtime from disk, not from inside a bundle.
  // ora@8 is ESM-only; bundling it sidesteps the CJS interop issue where
  // `require('ora').default` resolves to a Module namespace, not a function.
  noExternal: ['@driftlog/parser', '@driftlog/types', 'ora'],
  external: [
    'tree-sitter',
    'tree-sitter-typescript',
    '@driftlog/tree-sitter-dart',
    're2',
  ],
  banner: {
    js: '#!/usr/bin/env node',
  },
})
