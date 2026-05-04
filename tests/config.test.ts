import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadConfig,
  readScope,
  writeScope,
  setKey,
  configPath,
} from '../src/config.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'azenv-test-'));
  process.env.AZ_ENV_SYSTEM_PATH = join(tmp, 'system.json');
  process.env.AZ_ENV_GLOBAL_PATH = join(tmp, 'global.json');
  process.env.AZ_ENV_LOCAL_PATH = join(tmp, 'local.json');
});

afterEach(() => {
  delete process.env.AZ_ENV_SYSTEM_PATH;
  delete process.env.AZ_ENV_GLOBAL_PATH;
  delete process.env.AZ_ENV_LOCAL_PATH;
  rmSync(tmp, { recursive: true, force: true });
});

describe('configPath', () => {
  it('reflects env-var overrides', () => {
    expect(configPath('local')).toBe(process.env.AZ_ENV_LOCAL_PATH);
  });
});

describe('writeScope / readScope', () => {
  it('round-trips a config object', () => {
    writeScope('local', { vault: { name: 'v1' } });
    expect(readScope('local')).toEqual({ vault: { name: 'v1' } });
  });

  it('returns {} when the file does not exist', () => {
    expect(readScope('local')).toEqual({});
  });

  it('returns {} when the file is malformed JSON', () => {
    writeScope('local', { vault: { name: 'v1' } });
    const path = configPath('local');
    require('node:fs').writeFileSync(path, '{not json');
    expect(readScope('local')).toEqual({});
  });
});

describe('setKey', () => {
  it('creates nested structure from dotted keys', () => {
    setKey('local', 'resource.group', 'rg-prod');
    expect(readScope('local')).toEqual({ resource: { group: 'rg-prod' } });
  });

  it('does not clobber sibling keys', () => {
    setKey('local', 'resource.group', 'rg-prod');
    setKey('local', 'resource.subscription', 'sub-1');
    expect(readScope('local')).toEqual({
      resource: { group: 'rg-prod', subscription: 'sub-1' },
    });
  });

  it('overwrites a previous value', () => {
    setKey('local', 'vault.name', 'v1');
    setKey('local', 'vault.name', 'v2');
    expect(readScope('local').vault?.name).toBe('v2');
  });
});

describe('loadConfig (layering)', () => {
  it('local overrides global overrides system', () => {
    writeScope('system', { vault: { name: 'sys' }, app: { slot: 'sys-slot' } });
    writeScope('global', { vault: { name: 'glob' } });
    writeScope('local', { vault: { name: 'loc' } });

    const merged = loadConfig();
    expect(merged.vault?.name).toBe('loc');
    expect(merged.app?.slot).toBe('sys-slot');
  });

  it('returns {} when no scope files exist', () => {
    expect(loadConfig()).toEqual({});
  });
});

describe('writeScope side-effects', () => {
  it('creates parent directories if missing', () => {
    process.env.AZ_ENV_SYSTEM_PATH = join(tmp, 'a', 'b', 'c.json');
    writeScope('system', { vault: { name: 'x' } });
    expect(existsSync(process.env.AZ_ENV_SYSTEM_PATH)).toBe(true);
  });
});
