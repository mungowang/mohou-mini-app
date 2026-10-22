import { defineConfig } from 'vitest/config'

const nodeInclude = [
  'packages/*/*/tests/**/*.spec.ts',
  'packages/*/*/tests/**/*.spec.tsx',
  'packages/host/tests/**/*.spec.ts',
  'packages/panel/tests/**/*.spec.ts',
  'packages/panel/tests/**/*.spec.tsx',
  'packages/shell/tests/**/*.spec.ts',
  'apps/*/tests/**/*.spec.ts',
  'scripts/**/*.spec.mjs',
]

export default defineConfig({
  test: {
    // Forked workers avoid the worker-thread parser crash on the supported engines.
    pool: 'forks',
    projects: [
      {
        test: {
          name: 'kit',
          include: ['packages/app/ui/tests/**/*.test.ts', 'packages/app/ui/tests/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['packages/app/ui/tests/setup.ts'],
        },
      },
      {
        test: {
          name: 'node',
          include: nodeInclude,
          environment: 'node',
          // Host/boot specs under full-suite load need more than the 5s default.
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/*/*/src/**/*.ts',
        'packages/*/*/src/**/*.tsx',
        'packages/host/src/**/*.ts',
        'packages/panel/src/**/*.ts',
        'packages/panel/src/**/*.tsx',
        'packages/shell/src/**/*.ts',
      ],
      exclude: [
        'packages/app/ui/**',
        'packages/app/templates/**',
        'packages/shell/src/build-panel.ts',
        'packages/shell/src/dev.ts',
        'packages/shell/src/panel-page.ts',
        'packages/host/src/compile/build-vendor-cli.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
})
