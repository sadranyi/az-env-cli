import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { parseEnvFile } from '../env-parser.js';
import { toAzureSettings } from '../azure-export.js';
import { previewDiff } from '../preview.js';
import { loadConfig, getKey } from '../config.js';
import { buildSecretResolver } from '../secret-resolver.js';
import { diffSettings } from '../azure-diff.js';
import {
  createAzureClient,
  type AzureClientFactory,
  type AzureTarget,
} from '../azure-client.js';

interface DiffOpts {
  app?: string;
  slot?: string;
  resourceGroup?: string;
  subscription?: string;
  vault?: string;
}

export function registerDiff(
  program: Command,
  clientFactory: AzureClientFactory = createAzureClient,
): void {
  program
    .command('diff')
    .description('Compare local .env with current Azure App Service settings.')
    .argument('[envFile]', 'path to .env', '.env')
    .option('--app <name>', 'app name (overrides config)')
    .option('--slot <slot>', 'deployment slot (default: production)')
    .option('--resource-group <rg>', 'resource group (overrides config)')
    .option('--subscription <sub>', 'subscription id (overrides config)')
    .option('--vault <name>', 'default key vault name (overrides config)')
    .action(async (envFile: string, opts: DiffOpts) => {
      try {
        const code = await runDiff(envFile, opts, clientFactory);
        process.exit(code);
      } catch (err) {
        handleError(err);
      }
    });
}

async function runDiff(
  envFile: string,
  opts: DiffOpts,
  clientFactory: AzureClientFactory,
): Promise<number> {
  const path = resolve(process.cwd(), envFile);
  if (!existsSync(path)) {
    console.error(chalk.red(`File not found: ${path}`));
    return 2;
  }

  const entries = parseEnvFile(path);
  if (entries.length === 0) {
    console.error(chalk.red(`No variables found in ${envFile}.`));
    return 2;
  }

  const cfg = loadConfig();
  const target = resolveTarget(opts, cfg);
  const defaultVault = opts.vault ?? getKey('vault.name', cfg);

  const resolveSecret = await buildSecretResolver(entries, {
    defaultVault,
    noPrompt: true, // diff is non-interactive
  });
  const local = toAzureSettings(entries, resolveSecret);

  const client = clientFactory(target);

  console.log(
    chalk.bold(
      `\nFetching state of ${chalk.cyan(target.name)}` +
        (target.slot ? `:${target.slot}` : '') +
        chalk.dim(` (rg=${target.resourceGroup}, sub=${target.subscriptionId})`),
    ),
  );
  const azure = await client.fetchState();
  console.log(
    chalk.dim(
      `  kind=${azure.kind}, ${Object.keys(azure.appSettings).length} setting(s) currently set\n`,
    ),
  );

  const diff = diffSettings(local, azure);
  console.log(chalk.bold('Diff (local → Azure):'));
  previewDiff(diff);

  return diff.hasChanges ? 1 : 0;
}

function resolveTarget(
  opts: DiffOpts,
  cfg: ReturnType<typeof loadConfig>,
): AzureTarget {
  const subscriptionId = opts.subscription ?? getKey('resource.subscription', cfg);
  const resourceGroup = opts.resourceGroup ?? getKey('resource.group', cfg);
  const name = opts.app ?? getKey('app.name', cfg);

  if (!subscriptionId) throw new Error('Missing --subscription (or set resource.subscription in config).');
  if (!resourceGroup) throw new Error('Missing --resource-group (or set resource.group in config).');
  if (!name) throw new Error('Missing --app (or set app.name in config).');

  const slot = opts.slot ?? getKey('app.slot', cfg);
  return {
    subscriptionId,
    resourceGroup,
    name,
    slot: slot && slot !== 'production' ? slot : undefined,
  };
}

function handleError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';

  if (
    name === 'CredentialUnavailableError' ||
    /credential/i.test(msg) ||
    /DefaultAzureCredential/i.test(msg)
  ) {
    console.error(chalk.red('Azure authentication failed.'));
    console.error(
      chalk.dim('  Run `az login`, or set AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID.'),
    );
    console.error(chalk.dim(`  Underlying error: ${msg}`));
    process.exit(2);
  }

  console.error(chalk.red(`diff failed: ${msg}`));
  process.exit(2);
}
