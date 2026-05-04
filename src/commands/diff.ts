import { Command } from 'commander';
import chalk from 'chalk';

export function registerDiff(program: Command): void {
  program
    .command('diff')
    .description('Compare local .env with current Azure App Service settings.')
    .argument('[envFile]', 'path to .env', '.env')
    .option('--app <name>', 'app name (overrides config)')
    .option('--slot <slot>', 'deployment slot')
    .option('--type <type>', 'webapp | functionapp')
    .option('--resource-group <rg>', 'resource group (overrides config)')
    .option('--subscription <sub>', 'subscription id (overrides config)')
    .action(() => {
      console.log(chalk.yellow('diff: not implemented yet — coming with push.'));
      process.exit(2);
    });
}
