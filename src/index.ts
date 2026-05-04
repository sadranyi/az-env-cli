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
