# az-env-cli

[![CI](https://github.com/sadranyi/az-env-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/sadranyi/az-env-cli/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/sadranyi/az-env-cli)](https://codecov.io/gh/sadranyi/az-env-cli)
[![npm](https://img.shields.io/npm/v/az-env-cli.svg)](https://www.npmjs.com/package/az-env-cli)
[![downloads](https://img.shields.io/npm/dm/az-env-cli.svg)](https://www.npmjs.com/package/az-env-cli)
[![CodeRabbit](https://img.shields.io/coderabbit/prs/github/sadranyi/az-env-cli?label=CodeRabbit%20Reviews&labelColor=171717&color=FF570A)](https://coderabbit.ai)

Convert `.env` files into Azure App Service / Function App settings JSON, with
proper Key Vault references — and apply them straight to your running app via
`push` / `diff` against the live state.

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

# 3. Either generate JSON for the Azure CLI...
az-env export -o appsettings.json
az webapp config appsettings set --settings @appsettings.json --resource-group rg-prod --name my-app

# 3b. ...or apply directly with diff-then-confirm
az login
az-env diff --app my-app --resource-group rg-prod --subscription <sub-id>
az-env push --app my-app --resource-group rg-prod --subscription <sub-id> --mode merge
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
az-env diff   [envFile]              Compare local .env vs Azure (CI-friendly)
  --app <name>                        Required (or via config)
  --slot <slot>                       Default: production
  --resource-group <rg>               Required
  --subscription <sub>                Required
  --vault <name>                      Default vault for @secret entries
                                      Exit codes: 0=clean, 1=drift, 2=error
az-env push   [envFile]              Apply settings to App Service / Function App
  --mode <merge|replace>              Default: merge
  --app, --slot, --resource-group, --subscription, --vault   (same as diff)
  --no-preserve-reserved              Replace mode: also delete WEBSITE_*/FUNCTIONS_*/...
  --dry-run                           Show diff without applying
  -y, --yes                           Skip confirmation
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

## Pushing to Azure

`push` reads your `.env`, fetches the current Azure App Service state, shows a
diff, and applies changes after confirmation. Authentication uses
[`DefaultAzureCredential`](https://learn.microsoft.com/azure/developer/javascript/sdk/credential-chains)
— `az login` is the simplest path; managed identity, environment variables, and
VS Code credentials are also picked up automatically.

```bash
# Diff first (CI-friendly: exits 1 on drift)
az-env diff --app my-app --resource-group rg-prod --subscription <sub-id>

# Apply with merge (default): local overlays Azure, Azure-only settings preserved
az-env push --app my-app --resource-group rg-prod --subscription <sub-id>

# Apply with replace: Azure-only settings deleted (reserved settings preserved by default)
az-env push --mode replace --app my-app --resource-group rg-prod --subscription <sub-id>

# Same, but also delete reserved settings (WEBSITE_*, FUNCTIONS_*, etc.)
az-env push --mode replace --no-preserve-reserved --app my-app -y ...

# Preview only, no apply
az-env push --dry-run ...
```

Reserved Azure-managed settings (`WEBSITE_*`, `FUNCTIONS_*`, `APPINSIGHTS_*`,
`APPLICATIONINSIGHTS_*`, `AzureWebJobsStorage`) are preserved by default in
replace mode — opt out with `--no-preserve-reserved`.

`push` re-fetches Azure state right before applying and re-prompts if it
changed since the diff (basic optimistic concurrency). Slot-stickiness updates
are applied **before** settings, so a mid-flight failure leaves names sticky
but absent — benign on the next push.

`push` and `diff` only manage app settings — connection strings (a separate
Azure concept) are not handled in v0.2.

## Use as a library

```ts
import { parseEnvFile, toAzureSettings, buildKeyVaultRef } from 'az-env-cli';

const entries = parseEnvFile('.env');
const settings = toAzureSettings(entries, (e) => ({
  vault: 'my-vault',
  secretName: e.name.replace(/_/g, '-'),
}));
```

Public exports include `parseEnvFile`, `toAzureSettings`, `buildKeyVaultRef`,
`defaultSecretName`, `loadConfig` / `setKey` / `getKey`, `buildSecretResolver`,
`createAzureClient`, `diffSettings`, `resolveApply`, `isReservedName`, plus
type exports for `AzureTarget`, `AppState`, `AzureClient`, `SettingsDiff`,
`DiffEntry`, `ApplyMode`, and `ResolvedApply`.

## Roadmap

- [x] `export` — `.env` → Azure App Settings JSON
- [x] Inline `@secret` / `@slot` / `@secret(vault=,name=)` markers
- [x] Git-style 3-tier config
- [x] Key Vault reference generation
- [x] `push` — apply directly via `@azure/arm-appservice` with `--mode merge|replace`
- [x] `diff` — compare local `.env` vs current Azure settings (CI-friendly exit codes)
- [x] App Service + Function App support
- [x] `DefaultAzureCredential` auth (az CLI / managed identity / env vars)
- [ ] `pull` — write a `.env` skeleton from current Azure settings
- [ ] Connection strings (separate Azure concept, separate API)

## License

ISC © Samuel Adranyi
