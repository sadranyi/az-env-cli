export { parseEnvFile, parseEnvContent, ParsedEntry } from './env-parser.js';
export {
  toAzureSettings,
  buildKeyVaultRef,
  defaultSecretName,
  AzureSetting,
  SecretRef,
  SecretResolver,
} from './azure-export.js';
export { loadConfig, readScope, writeScope, setKey, getKey, configPath } from './config.js';
export type { AzEnvConfig, ConfigScope } from './config.js';
export { buildSecretResolver } from './secret-resolver.js';
export type { BuildSecretResolverOptions } from './secret-resolver.js';
export {
  createAzureClient,
  type AzureClient,
  type AzureClientFactory,
  type AzureTarget,
  type AppState,
} from './azure-client.js';
export {
  diffSettings,
  type DiffEntry,
  type DiffEntryKind,
  type SettingsDiff,
} from './azure-diff.js';
export {
  resolveApply,
  isReservedName,
  type ApplyMode,
  type ResolveApplyOptions,
  type ResolvedApply,
} from './azure-merge.js';
