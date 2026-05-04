# az-env-cli

[![CI](https://github.com/sadranyi/az-env-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/sadranyi/az-env-cli/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/sadranyi/az-env-cli)](https://codecov.io/gh/sadranyi/az-env-cli)
[![npm](https://img.shields.io/npm/v/az-env-cli.svg)](https://www.npmjs.com/package/az-env-cli)
[![downloads](https://img.shields.io/npm/dm/az-env-cli.svg)](https://www.npmjs.com/package/az-env-cli)

Convert `.env` files into Azure App Service / Function App settings JSON, with
proper Key Vault references and (coming next release) direct-apply.

```text
   _   ____   _____ _   ___     __  ____ _     ___
  / \ |_  /  | ____| \ | \ \   / / / ___| |   |_ _|
 / _ \ /  /  |  _| |  \| |\ \ / / | |   | |    | |
/ ___ \/ /_  | |___| |\  | \ V /  | |___| |___ | |
/_/   \_\___| |_____|_| \_|  \_/    \____|_____|___|

         .env → Azure App Settings, safely.
```

## Why

Hand-rolling Azure App Settings JSON is tedious, and copying secrets through
the clipboard is how they end up in chat history. `az-env-cli` reads a `.env`,
preserves your intent (which vars are slot-pinned, which live in Key Vault),
and emits the exact JSON Azure expects.

## Install

```bash
npm install -D az-env-cli
# or globally
npm install -g az-env-cli
```

Requires Node 18+.

## Quick start

```bash
# 1. Set defaults once (git-style)
az-env config --global vault.name my-vault
az-env config resource.group rg-prod          # local, per-project

# 2. Annotate your .env with markers
cat .env
# DATABASE_URL=postgres://...
# CLIENT_ID=abc-123                           # @slot
# CLIENT_SECRET=changeme                      # @secret @slot

# 3. Generate the Azure JSON
az-env export -o appsettings.json
```

## Marker syntax

Inline trailing comments on `KEY=VALUE` lines control how each variable is
emitted. Markers compose freely.

| Marker                                | Effect                                                          |
| ------------------------------------- | --------------------------------------------------------------- |
| `# @slot`                             | Sets `slotSetting: true` (sticks to deployment slot)            |
| `# @secret`                           | Replaces value with a Key Vault reference using config defaults |
| `# @secret(vault=v,name=SECRET-NAME)` | Explicit per-variable Key Vault override                        |

Default secret name is the env var name with underscores replaced by hyphens
(Key Vault disallows underscores), e.g. `AZURE_CLIENT_SECRET` →
`AZURE-CLIENT-SECRET`. Override with `@secret(name=...)` when needed.

## Output

```json
[
  {
    "name": "DATABASE_URL",
    "value": "postgres://...",
    "slotSetting": false
  },
  {
    "name": "CLIENT_ID",
    "value": "abc-123",
    "slotSetting": true
  },
  {
    "name": "CLIENT_SECRET",
    "value": "@Microsoft.KeyVault(VaultName=my-vault;SecretName=CLIENT-SECRET)",
    "slotSetting": true
  }
]
```

This is the exact shape consumed by `az webapp config appsettings set --settings @appsettings.json`.

## Commands

```text
az-env init                          Create a local .azenvrc
az-env config [key] [value]          Get/set config values
  --system | --global | --local       Scope (default: local)
  --list                              Print all scopes
az-env export [envFile]              Convert .env → Azure JSON
  -o, --out <file>                    Write JSON to file (default: stdout)
  -y, --yes                           Skip preview confirmation
  --vault <name>                      Override default vault
az-env push   [envFile]              [coming next release]
az-env diff   [envFile]              [coming next release]
```

## Configuration

`az-env-cli` layers config git-style. Lower precedence first, higher overrides:

| Scope    | Path (Windows)                                       | Path (Unix)                       |
| -------- | ---------------------------------------------------- | --------------------------------- |
| System   | `%PROGRAMDATA%\az-env-cli\config.json`               | `/etc/az-env-cli/config.json`     |
| Global   | `%USERPROFILE%\.azenvrc`                             | `~/.azenvrc`                      |
| Local    | `./.azenvrc` (per-project)                           | `./.azenvrc`                      |

Recognized keys:

```jsonc
{
  "vault":    { "name": "my-vault" },
  "resource": { "group": "rg-prod", "subscription": "...", "tenant": "..." },
  "app":      { "name": "my-app", "slot": "production", "type": "webapp" },
  "defaults": { "mode": "merge" }
}
```

CLI flags always win over config.

## Use as a library

```ts
import { parseEnvFile, toAzureSettings, buildKeyVaultRef } from 'az-env-cli';

const entries = parseEnvFile('.env');
const settings = toAzureSettings(entries, (e) => ({
  vault: 'my-vault',
  secretName: e.name.replace(/_/g, '-'),
}));
```

Public exports: `parseEnvFile`, `parseEnvContent`, `toAzureSettings`,
`buildKeyVaultRef`, `defaultSecretName`, `loadConfig`, `readScope`,
`writeScope`, `setKey`, `getKey`, `configPath`.

## Roadmap

- [x] `export` — `.env` → Azure App Settings JSON
- [x] Inline `@secret` / `@slot` / `@secret(vault=,name=)` markers
- [x] Git-style 3-tier config
- [x] Key Vault reference generation
- [ ] `push` — apply directly via `@azure/arm-appservice` with `--mode merge|replace`
- [ ] `diff` — compare local `.env` vs current Azure settings
- [ ] App Service + Function App support
- [ ] `DefaultAzureCredential` auth (az CLI / managed identity / env vars)

## License

ISC © Samuel Adranyi
