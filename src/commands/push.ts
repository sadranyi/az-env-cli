import { Command } from 'commander';
import chalk from 'chalk';

export function registerPush(program: Command): void {
  program
    .command('push')
    .description('Apply settings directly to an Azure App Service / Function App.')
    .argument('[envFile]', 'path to .env', '.env')
    .option('--mode <mode>', 'merge | replace', 'merge')
    .option('--app <name>', 'app name (overrides config)')
    .option('--slot <slot>', 'deployment slot')
    .option('--type <type>', 'webapp | functionapp')
    .option('--resource-group <rg>', 'resource group (overrides config)')
    .option('--subscription <sub>', 'subscription id (overrides config)')
    .option('--dry-run', 'show what would change without applying')
    .option('-y, --yes', 'skip confirmation')
    .action(() => {
      console.log(chalk.yellow('push: not implemented yet — coming next iteration.'));
      console.log(
        chalk.dim(
          '  Will use DefaultAzureCredential + @azure/arm-appservice with merge|replace semantics,\n' +
            '  showing a diff against current settings before applying.',
        ),
      );
      process.exit(2);
    });
}
