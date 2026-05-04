import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export type ConfigScope = 'system' | 'global' | 'local';

export interface AzEnvConfig {
  vault?: { name?: string };
  resource?: { group?: string; subscription?: string; tenant?: string };
  app?: { name?: string; slot?: string; type?: 'webapp' | 'functionapp' };
  defaults?: { mode?: 'merge' | 'replace' };
}

function systemPath(): string {
  if (process.env.AZ_ENV_SYSTEM_PATH) return process.env.AZ_ENV_SYSTEM_PATH;
  return process.platform === 'win32'
    ? join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'az-env-cli', 'config.json')
    : '/etc/az-env-cli/config.json';
}

function globalPath(): string {
  return process.env.AZ_ENV_GLOBAL_PATH ?? join(homedir(), '.azenvrc');
}

function localPath(): string {
  return process.env.AZ_ENV_LOCAL_PATH ?? resolve(process.cwd(), '.azenvrc');
}

function paths(): Record<ConfigScope, string> {
  return { system: systemPath(), global: globalPath(), local: localPath() };
}

function readJson(p: string): AzEnvConfig {
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(a: unknown, b: unknown): unknown {
  if (b === undefined) return a;
  if (!isPlainObject(b)) return b;
  const base: Record<string, unknown> = isPlainObject(a) ? { ...a } : {};
  for (const [k, v] of Object.entries(b)) base[k] = deepMerge(base[k], v);
  return base;
}

export function loadConfig(): AzEnvConfig {
  const p = paths();
  const merged = (['system', 'global', 'local'] as ConfigScope[])
    .map((s) => readJson(p[s]))
    .reduce<unknown>((acc, cur) => deepMerge(acc, cur), {});
  return (merged ?? {}) as AzEnvConfig;
}

export function readScope(scope: ConfigScope): AzEnvConfig {
  return readJson(paths()[scope]);
}

export function writeScope(scope: ConfigScope, cfg: AzEnvConfig): void {
  const p = paths()[scope];
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
}

export function setKey(scope: ConfigScope, dotted: string, value: string): void {
  const cfg = readScope(scope) as Record<string, unknown>;
  const parts = dotted.split('.');
  let obj = cfg;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!isPlainObject(obj[key])) obj[key] = {};
    obj = obj[key] as Record<string, unknown>;
  }
  obj[parts[parts.length - 1]] = value;
  writeScope(scope, cfg as AzEnvConfig);
}

export function getKey(dotted: string, cfg: AzEnvConfig = loadConfig()): string | undefined {
  const v = dotted
    .split('.')
    .reduce<unknown>((o, k) => (isPlainObject(o) ? o[k] : undefined), cfg);
  return typeof v === 'string' ? v : undefined;
}

export function configPath(scope: ConfigScope): string {
  return paths()[scope];
}
