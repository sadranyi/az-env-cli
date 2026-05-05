import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPush } from '../src/commands/push.js';
import type {
  AzureClient,
  AzureClientFactory,
  AzureTarget,
  AppState,
} from '../src/azure-client.js';

interface FakeCall {
  method: 'fetchState' | 'applySettings' | 'applySlotConfigNames';
  args?: unknown;
}

interface FakeOptions {
  initialState: AppState;
  driftState?: AppState;
  fetchError?: Error;
}

function createFake(opts: FakeOptions): { client: AzureClient; calls: FakeCall[]; target?: AzureTarget } {
  const calls: FakeCall[] = [];
  let fetchCount = 0;
  let captured: AzureTarget | undefined;
  const client: AzureClient = {
    async fetchState() {
      calls.push({ method: 'fetchState' });
      if (opts.fetchError) throw opts.fetchError;
      fetchCount++;
      if (opts.driftState && fetchCount === 2) return opts.driftState;
      return opts.initialState;
    },
    async applySettings(s) {
      calls.push({ method: 'applySettings', args: s });
    },
    async applySlotConfigNames(n) {
      calls.push({ method: 'applySlotConfigNames', args: n });
    },
  };
  const factory: AzureClientFactory = (target) => {
    captured = target;
    return client;
  };
  // attach factory to the result via closure trick
  return Object.assign({ client, calls }, { factory, get target() { return captured; } });
}

let workdir: string;
let envPath: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'azenv-push-test-'));
  envPath = join(workdir, '.env');
  // Isolate config so loadConfig() doesn't pick up the real user's .azenvrc
  process.env.AZ_ENV_SYSTEM_PATH = join(workdir, 'system.json');
  process.env.AZ_ENV_GLOBAL_PATH = join(workdir, 'global.json');
  process.env.AZ_ENV_LOCAL_PATH = join(workdir, 'local.json');
  // Quiet vitest console
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.AZ_ENV_SYSTEM_PATH;
  delete process.env.AZ_ENV_GLOBAL_PATH;
  delete process.env.AZ_ENV_LOCAL_PATH;
  rmSync(workdir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const baseOpts = {
  mode: 'merge',
  app: 'app',
  resourceGroup: 'rg',
  subscription: 'sub',
  preserveReserved: true,
  yes: true,
};

describe('runPush', () => {
  it('happy path: applies slot config names FIRST, then settings', async () => {
    writeFileSync(envPath, 'A=1\nB=2 # @slot\n');
    const fake = createFake({
      initialState: { appSettings: {}, slotConfigNames: [], kind: 'app' },
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await runPush(envPath, baseOpts, fake.factory);

    const methods = fake.calls.map((c) => c.method);
    expect(methods.filter((m) => m !== 'fetchState')).toEqual([
      'applySlotConfigNames',
      'applySettings',
    ]);
    const applySettings = fake.calls.find((c) => c.method === 'applySettings')!;
    expect(applySettings.args).toEqual({ A: '1', B: '2' });
    const applySticky = fake.calls.find((c) => c.method === 'applySlotConfigNames')!;
    expect(applySticky.args).toEqual(['B']);
  });

  it('--dry-run skips apply', async () => {
    writeFileSync(envPath, 'A=1\n');
    const fake = createFake({
      initialState: { appSettings: {}, slotConfigNames: [], kind: 'app' },
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await runPush(envPath, { ...baseOpts, dryRun: true }, fake.factory);

    const methods = fake.calls.map((c) => c.method);
    expect(methods).toContain('fetchState');
    expect(methods).not.toContain('applySettings');
    expect(methods).not.toContain('applySlotConfigNames');
  });

  it('no changes: fetches once, skips apply', async () => {
    writeFileSync(envPath, 'A=1\n');
    const fake = createFake({
      initialState: { appSettings: { A: '1' }, slotConfigNames: [], kind: 'app' },
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await runPush(envPath, baseOpts, fake.factory);

    expect(fake.calls.filter((c) => c.method === 'fetchState')).toHaveLength(1);
    expect(fake.calls.filter((c) => c.method === 'applySettings')).toHaveLength(0);
    expect(fake.calls.filter((c) => c.method === 'applySlotConfigNames')).toHaveLength(0);
  });

  it('drift detection: re-fetches and applies against the fresh state', async () => {
    writeFileSync(envPath, 'A=1\n');
    const fake = createFake({
      initialState: { appSettings: { OLD: 'x' }, slotConfigNames: [], kind: 'app' },
      driftState: { appSettings: { OLD: 'x', NEW: 'y' }, slotConfigNames: [], kind: 'app' },
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await runPush(envPath, { ...baseOpts, mode: 'merge' }, fake.factory);

    expect(fake.calls.filter((c) => c.method === 'fetchState')).toHaveLength(2);
    const applySettings = fake.calls.find((c) => c.method === 'applySettings')!;
    // merge mode preserves NEW from driftState (not in initialState)
    expect(applySettings.args).toEqual({ OLD: 'x', NEW: 'y', A: '1' });
  });

  it('replace mode: deletes Azure-only settings while preserving reserved', async () => {
    writeFileSync(envPath, 'A=1\n');
    const fake = createFake({
      initialState: {
        appSettings: { OLD: 'x', WEBSITE_NODE_DEFAULT_VERSION: '20' },
        slotConfigNames: [],
        kind: 'app',
      },
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await runPush(envPath, { ...baseOpts, mode: 'replace' }, fake.factory);

    const applySettings = fake.calls.find((c) => c.method === 'applySettings')!;
    expect(applySettings.args).toEqual({ A: '1', WEBSITE_NODE_DEFAULT_VERSION: '20' });
  });

  it('replace mode + --no-preserve-reserved: deletes everything not in local', async () => {
    writeFileSync(envPath, 'A=1\n');
    const fake = createFake({
      initialState: {
        appSettings: { WEBSITE_NODE_DEFAULT_VERSION: '20' },
        slotConfigNames: [],
        kind: 'app',
      },
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await runPush(
      envPath,
      { ...baseOpts, mode: 'replace', preserveReserved: false },
      fake.factory,
    );

    const applySettings = fake.calls.find((c) => c.method === 'applySettings')!;
    expect(applySettings.args).toEqual({ A: '1' });
  });

  it('throws when env file does not exist', async () => {
    const fake = createFake({
      initialState: { appSettings: {}, slotConfigNames: [], kind: 'app' },
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await expect(
      runPush(join(workdir, 'nope.env'), baseOpts, fake.factory),
    ).rejects.toThrow(/File not found/);
  });

  it('throws when target args are missing', async () => {
    writeFileSync(envPath, 'A=1\n');
    const fake = createFake({
      initialState: { appSettings: {}, slotConfigNames: [], kind: 'app' },
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await expect(
      runPush(envPath, { ...baseOpts, app: undefined }, fake.factory),
    ).rejects.toThrow(/--app/);
  });

  it('throws when mode is invalid', async () => {
    writeFileSync(envPath, 'A=1\n');
    const fake = createFake({
      initialState: { appSettings: {}, slotConfigNames: [], kind: 'app' },
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await expect(
      runPush(envPath, { ...baseOpts, mode: 'replaceall' }, fake.factory),
    ).rejects.toThrow(/--mode must be/);
  });

  it('propagates Azure SDK errors (auth failure et al)', async () => {
    writeFileSync(envPath, 'A=1\n');
    const authErr = new Error('DefaultAzureCredential failed to retrieve a token');
    authErr.name = 'CredentialUnavailableError';
    const fake = createFake({
      initialState: { appSettings: {}, slotConfigNames: [], kind: 'app' },
      fetchError: authErr,
    }) as ReturnType<typeof createFake> & { factory: AzureClientFactory };

    await expect(runPush(envPath, baseOpts, fake.factory)).rejects.toBe(authErr);
  });
});
