import { ParsedEntry } from './env-parser.js';

export interface AzureSetting {
  name: string;
  value: string;
  slotSetting: boolean;
}

export interface SecretRef {
  vault: string;
  secretName: string;
}

export type SecretResolver = (entry: ParsedEntry) => SecretRef;

export function buildKeyVaultRef(vault: string, secretName: string): string {
  return `@Microsoft.KeyVault(VaultName=${vault};SecretName=${secretName})`;
}

export function toAzureSettings(
  entries: ParsedEntry[],
  resolveSecret: SecretResolver,
): AzureSetting[] {
  return entries.map((e) => {
    if (e.isSecret) {
      const { vault, secretName } = resolveSecret(e);
      return {
        name: e.name,
        value: buildKeyVaultRef(vault, secretName),
        slotSetting: e.slotSetting,
      };
    }
    return { name: e.name, value: e.value, slotSetting: e.slotSetting };
  });
}

export function defaultSecretName(envName: string): string {
  return envName.replace(/_/g, '-');
}
