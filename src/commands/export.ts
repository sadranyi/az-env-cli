import { Command } from 'commander';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { confirm, input } from '@inquirer/prompts';
import { parseEnvFile, ParsedEntry } from '../env-parser.js';
import { toAzureSettings, defaultSecretName, SecretResolver, SecretRef } from '../azure-export.js';
import { previewSettings } from '../preview.js';
import { loadConfig, getKey } from '../config.js';

interface ExportOpts {
  out?: string;
  yes?: boolean;
  vault?: string;
}

export function registerExport(program: Command): void {
  program
    .command('export')
    .description('Convert a .env file to Azure App Service settings JSON.')
    .argument('[envFile]', 'path to .env', '.env')
    .option('-o, --out <file>', 'write JSON to file (omit for stdout)')
    .option('-y, --yes', 'skip preview confirmation (CI-friendly)')
    .option('--vault <name>', 'default key vault name (overrides config)')
    .action(async (envFile: string, opts: ExportOpts) => {
      const path = resolve(process.cwd(), envFile);
      if (!existsSync(path)) {
        console.error(chalk.red(`File not found: ${path}`));
        process.exit(1);
      }

      const entries = parseEnvFile(path);
      if (entries.length === 0) {
        console.error(chalk.red(`No variables found in ${envFile}.`));
        process.exit(1);
      }

      const cfg = loadConfig();
      const defaultVault = opts.vault ?? getKey('vault.name', cfg);

      const resolveSecret = await buildSecretResolver(entries, defaultVault, !!opts.yes);
      const settings = toAzureSettings(entries, resolveSecret);

      console.log(chalk.bold('\nPreview:'));
      previewSettings(settings);

      if (!opts.yes && process.stdout.isTTY) {
        const ok = await confirm({ message: 'Looks good?', default: true });
        if (!ok) {
          console.log(chalk.yellow('Aborted.'));
          process.exit(0);
        }
      }

      const json = JSON.stringify(settings, null, 2);
      if (opts.out) {
        const outPath = resolve(process.cwd(), opts.out);
        writeFileSync(outPath, json + '\n');
        console.log(chalk.green(`Wrote ${outPath}`));
      } else {
        console.log(json);
      }
    });
}

async function buildSecretResolver(
  entries: ParsedEntry[],
  defaultVault: string | undefined,
  noPrompt: boolean,
): Promise<SecretResolver> {
  const cache = new Map<string, SecretRef>();

  for (const e of entries) {
    if (!e.isSecret) continue;

    let vault = e.vaultRef?.vault ?? defaultVault;
    const secretName = e.vaultRef?.secretName ?? defaultSecretName(e.name);

    if (!vault) {
      if (noPrompt || !process.stdout.isTTY) {
        throw new Error(
          `No vault for secret ${e.name}. Set 'vault.name' in config, pass --vault, or use @secret(vault=...,name=...).`,
        );
      }
      vault = await input({
        message: `Vault name for secret ${chalk.cyan(e.name)}:`,
        validate: (v: string) => v.trim().length > 0 || 'required',
      });
    }
    cache.set(e.name, { vault, secretName });
  }

  return (e: ParsedEntry) => {
    const ref = cache.get(e.name);
    if (!ref) throw new Error(`Secret resolver missing for ${e.name}`);
    return ref;
  };
}
