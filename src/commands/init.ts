import { Command } from 'commander';
import chalk from 'chalk';
import { writeScope, readScope, configPath } from '../config.js';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create a local .azenvrc in the current directory.')
    .option('-f, --force', 'overwrite an existing .azenvrc')
    .action((opts: { force?: boolean }) => {
      const existing = readScope('local');
      if (Object.keys(existing).length && !opts.force) {
        console.error(
          chalk.red(`A local .azenvrc already exists at ${configPath('local')}.`),
        );
        console.error(chalk.dim('Use --force to overwrite.'));
        process.exit(1);
      }

      writeScope('local', {
        resource: { group: '', subscription: '' },
        app: { name: '', slot: 'production', type: 'webapp' },
        vault: { name: '' },
        defaults: { mode: 'merge' },
      });

      console.log(chalk.green(`Created ${configPath('local')}`));
      console.log(chalk.dim('Set values with `az-env config <key> <value>` (git-style).'));
    });
}
