import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli.ts',
        'src/banner.ts',
        'src/index.ts',
        'src/azure-client.ts',
        'src/commands/init.ts',
        'src/commands/config.ts',
        'src/commands/export.ts',
        'src/commands/diff.ts',
      ],
    },
  },
});
