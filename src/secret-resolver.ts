import chalk from 'chalk';
import { input } from '@inquirer/prompts';
import type { ParsedEntry } from './env-parser.js';
import type { SecretResolver, SecretRef } from './azure-export.js';
import { defaultSecretName } from './azure-export.js';

export interface BuildSecretResolverOptions {
  defaultVault?: string;
  noPrompt?: boolean;
}

export async function buildSecretResolver(
  entries: ParsedEntry[],
  opts: BuildSecretResolverOptions = {},
): Promise<SecretResolver> {
  const { defaultVault, noPrompt = false } = opts;
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
