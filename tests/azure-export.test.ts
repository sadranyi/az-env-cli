import { describe, it, expect } from 'vitest';
import {
  buildKeyVaultRef,
  defaultSecretName,
  toAzureSettings,
} from '../src/azure-export.js';
import { ParsedEntry } from '../src/env-parser.js';

const entry = (over: Partial<ParsedEntry>): ParsedEntry => ({
  name: 'FOO',
  value: 'bar',
  isSecret: false,
  slotSetting: false,
  rawLine: 1,
  ...over,
});

describe('buildKeyVaultRef', () => {
  it('matches the Azure App Settings format exactly', () => {
    expect(buildKeyVaultRef('myvault', 'MY-SECRET')).toBe(
      '@Microsoft.KeyVault(VaultName=myvault;SecretName=MY-SECRET)',
    );
  });
});

describe('defaultSecretName', () => {
  it('replaces underscores with hyphens (Key Vault disallows _)', () => {
    expect(defaultSecretName('AZURE_CLIENT_SECRET')).toBe('AZURE-CLIENT-SECRET');
  });
});

describe('toAzureSettings', () => {
  const resolver = () => ({ vault: 'v', secretName: 'S' });

  it('passes plain entries through untouched', () => {
    const out = toAzureSettings([entry({ name: 'A', value: '1' })], resolver);
    expect(out).toEqual([{ name: 'A', value: '1', slotSetting: false }]);
  });

  it('rewrites secrets as Key Vault references', () => {
    const out = toAzureSettings(
      [entry({ name: 'PWD', value: 'changeme', isSecret: true })],
      resolver,
    );
    expect(out[0].value).toBe('@Microsoft.KeyVault(VaultName=v;SecretName=S)');
  });

  it('preserves slotSetting flag', () => {
    const out = toAzureSettings([entry({ name: 'X', slotSetting: true })], resolver);
    expect(out[0].slotSetting).toBe(true);
  });

  it('preserves order', () => {
    const out = toAzureSettings(
      ['A', 'B', 'C'].map((name) => entry({ name })),
      resolver,
    );
    expect(out.map((s) => s.name)).toEqual(['A', 'B', 'C']);
  });

  it('matches the exact Azure JSON shape from the README example', () => {
    const out = toAzureSettings(
      [
        entry({
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING',
          value: 'InstrumentationKey=abc',
        }),
        entry({ name: 'AZURE_CLIENT_ID', value: 'xyz', slotSetting: true }),
        entry({
          name: 'AZURE_CLIENT_SECRET',
          value: 'changeme',
          isSecret: true,
          slotSetting: true,
          vaultRef: { vault: 'ominiticketsvault', secretName: 'AZURE-CLIENT-SECRET' },
        }),
      ],
      (e) => e.vaultRef as { vault: string; secretName: string },
    );
    expect(out[2]).toEqual({
      name: 'AZURE_CLIENT_SECRET',
      value: '@Microsoft.KeyVault(VaultName=ominiticketsvault;SecretName=AZURE-CLIENT-SECRET)',
      slotSetting: true,
    });
  });
});
