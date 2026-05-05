import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { parseEnvFile } from '../env-parser.js';
import { toAzureSettings } from '../azure-export.js';
import { previewDiff } from '../preview.js';
import { loadConfig, getKey } from '../config.js';
import { buildSecretResolver } from '../secret-resolver.js';
import { diffSettings } from '../azure-diff.js';
import { resolveApply, type ApplyMode } from '../azure-merge.js';
import {
  createAzureClient,
  type AzureClient,
  type AzureClientFactory,
  type AzureTarget,
  type AppState,
} from '../azure-client.js';

interface PushOpts {
  mode: string;
  app?: string;
  slot?: string;
  resourceGroup?: string;
  subscription?: string;
  vault?: string;
  preserveReserved: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

export function registerPush(
  program: Command,
  clientFactory: AzureClientFactory = createAzureClient,
): void {
  program
    .command('push')
    .description('Apply settings directly to an Azure App Service / Function App.')
    .argument('[envFile]', 'path to .env', '.env')
    .option('--mode <mode>', 'merge | replace', 'merge')
    .option('--app <name>', 'app name (overrides config)')
    .option('--slot <slot>', 'deployment slot (default: production)')
    .option('--resource-group <rg>', 'resource group (overrides config)')
    .option('--subscription <sub>', 'subscription id (overrides config)')
    .option('--vault <name>', 'default key vault name (overrides config)')
    .option(
      '--no-preserve-reserved',
      'in replace mode, also delete WEBSITE_*/FUNCTIONS_*/APPINSIGHTS_*/AzureWebJobsStorage',
    )
    .option('--dry-run', 'show diff without applying')
    .option('-y, --yes', 'skip confirmation')
    .action(async (envFile: string, opts: PushOpts) => {
      try {
        await runPush(envFile, opts, clientFactory);
      } catch (err) {
        handleError(err);
      }
    });
}

export async function runPush(
  envFile: string,
  opts: PushOpts,
  clientFactory: AzureClientFactory,
): Promise<void> {
  const mode = parseMode(opts.mode);
  const path = resolve(process.cwd(), envFile);
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }

  const entries = parseEnvFile(path);
  if (entries.length === 0) {
    throw new Error(`No variables found in ${envFile}.`);
  }

  const cfg = loadConfig();
  const target = resolveTarget(opts, cfg);
  const defaultVault = opts.vault ?? getKey('vault.name', cfg);

  const interactive = process.stdout.isTTY;

  // Fail fast in non-interactive environments without --yes
  if (!opts.yes && !interactive) {
    throw new Error(
      'Cannot proceed without confirmation in non-interactive environment. Use --yes to skip confirmation.'
    );
  }

  const resolveSecret = await buildSecretResolver(entries, {
    defaultVault,
    noPrompt: !!opts.yes,
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
  console.log(chalk.dim(`  kind=${azure.kind}, ${Object.keys(azure.appSettings).length} setting(s) currently set\n`));

  let diff = diffSettings(local, azure);
  console.log(chalk.bold('Diff (local → Azure):'));
  previewDiff(diff);

  if (!diff.hasChanges) {
    console.log(chalk.green('No changes — local matches Azure. Nothing to push.'));
    return;
  }

  if (opts.dryRun) {
    console.log(chalk.dim('--dry-run: stopping before apply.'));
    return;
  }

  let resolved = resolveApply(mode, local, azure, {
    preserveReserved: opts.preserveReserved,
  });

  printSafetySummary(mode, resolved);

  if (!opts.yes && interactive) {
    const ok = await confirm({
      message: `Apply with --mode ${mode}?`,
      default: false,
    });
    if (!ok) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  // Concurrency check: re-fetch and re-prompt if Azure changed.
  const fresh = await client.fetchState();
  if (!sameState(azure, fresh)) {
    console.log(
      chalk.yellow(
        '\nAzure state changed since the diff above. Re-checking...\n',
      ),
    );
    diff = diffSettings(local, fresh);
    previewDiff(diff);
    if (!diff.hasChanges) {
      console.log(chalk.green('After concurrent change, local matches Azure. Nothing to push.'));
      return;
    }
    resolved = resolveApply(mode, local, fresh, {
      preserveReserved: opts.preserveReserved,
    });
    printSafetySummary(mode, resolved);
    if (!opts.yes && interactive) {
      const ok = await confirm({
        message: 'Apply against the new Azure state?',
        default: false,
      });
      if (!ok) {
        console.log(chalk.yellow('Aborted.'));
        return;
      }
    }
  }

  await applyToAzure(client, resolved);

  const counts = summarizeCounts(diff);
  console.log(
    chalk.green(
      `\nDone. ${counts.added} added, ${counts.changed} changed, ${counts.removed} removed.`,
    ),
  );
}

function parseMode(value: string): ApplyMode {
  if (value !== 'merge' && value !== 'replace') {
    throw new Error(`--mode must be 'merge' or 'replace' (got '${value}')`);
  }
  return value;
}

function resolveTarget(
  opts: PushOpts,
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

function sameState(a: AppState, b: AppState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function printSafetySummary(
  mode: ApplyMode,
  resolved: ReturnType<typeof resolveApply>,
): void {
  if (mode === 'replace' && resolved.deletedNames.length > 0) {
    console.log(
      chalk.red(
        `\n  ${resolved.deletedNames.length} setting(s) on Azure will be DELETED:`,
      ),
    );
    for (const n of resolved.deletedNames) {
      console.log(chalk.red(`    - ${n}`));
    }
  }
  if (resolved.preservedReserved.length > 0) {
    console.log(
      chalk.dim(
        `  Preserving ${resolved.preservedReserved.length} reserved setting(s) (--no-preserve-reserved to override): ${resolved.preservedReserved.join(', ')}`,
      ),
    );
  }
  console.log();
}

async function applyToAzure(
  client: AzureClient,
  resolved: ReturnType<typeof resolveApply>,
): Promise<void> {
  // Slot config names FIRST. If settings update fails after, names being
  // sticky-but-absent is benign on next push.
  await client.applySlotConfigNames(resolved.slotConfigNames);
  await client.applySettings(resolved.settings);
}

function summarizeCounts(diff: ReturnType<typeof diffSettings>): {
  added: number;
  changed: number;
  removed: number;
} {
  let added = 0;
  let changed = 0;
  let removed = 0;
  for (const e of diff.entries) {
    if (e.kind === 'added') added++;
    else if (e.kind === 'changed') changed++;
    else if (e.kind === 'removed') removed++;
  }
  return { added, changed, removed };
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
      chalk.dim(
        '  Run `az login`, or set AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID.',
      ),
    );
    console.error(chalk.dim(`  Underlying error: ${msg}`));
    process.exit(1);
  }

  console.error(chalk.red(`push failed: ${msg}`));
  process.exit(1);
}
