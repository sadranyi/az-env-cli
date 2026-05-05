#!/usr/bin/env node
import { Command } from 'commander';
import { renderBanner } from './banner.js';
import { registerInit } from './commands/init.js';
import { registerConfig } from './commands/config.js';
import { registerExport } from './commands/export.js';
import { registerPush } from './commands/push.js';
import { registerDiff } from './commands/diff.js';

const program = new Command();

program
  .name('az-env')
  .description('.env → Azure App Service settings, with Key Vault references and direct-apply.')
  .version('0.2.0')
  .hook('preAction', () => {
    if (process.stdout.isTTY && !process.env.AZ_ENV_NO_BANNER) {
      renderBanner();
    }
  });

registerInit(program);
registerConfig(program);
registerExport(program);
registerPush(program);
registerDiff(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
