import { describe, it, expect } from 'vitest';
import { resolveApply, isReservedName } from '../src/azure-merge.js';
import type { AzureSetting } from '../src/azure-export.js';
import type { AppState } from '../src/azure-client.js';

const setting = (over: Partial<AzureSetting> & Pick<AzureSetting, 'name'>): AzureSetting => ({
  value: 'v',
  slotSetting: false,
  ...over,
});

const state = (over: Partial<AppState> = {}): AppState => ({
  appSettings: {},
  slotConfigNames: [],
  kind: 'app',
  ...over,
});

describe('isReservedName', () => {
  it.each([
    ['WEBSITE_NODE_DEFAULT_VERSION', true],
    ['WEBSITE_RUN_FROM_PACKAGE', true],
    ['FUNCTIONS_WORKER_RUNTIME', true],
    ['APPINSIGHTS_INSTRUMENTATIONKEY', true],
    ['APPLICATIONINSIGHTS_CONNECTION_STRING', true],
    ['AzureWebJobsStorage', true],
    ['DATABASE_URL', false],
    ['MY_WEBSITE', false],
  ])('%s -> %s', (n, expected) => {
    expect(isReservedName(n)).toBe(expected);
  });
});

describe('resolveApply (merge)', () => {
  it('overlays local on top of Azure', () => {
    const r = resolveApply(
      'merge',
      [setting({ name: 'A', value: 'new' }), setting({ name: 'B', value: 'fresh' })],
      state({ appSettings: { A: 'old', C: 'azure-only' } }),
    );
    expect(r.settings).toEqual({ A: 'new', B: 'fresh', C: 'azure-only' });
    expect(r.deletedNames).toEqual([]);
    expect(r.preservedReserved).toEqual([]);
  });

  it('preserves Azure-only sticky names while applying local sticky names', () => {
    const r = resolveApply(
      'merge',
      [
        setting({ name: 'A', value: '1', slotSetting: true }),
        setting({ name: 'B', value: '2', slotSetting: false }),
      ],
      state({
        appSettings: { A: '1', B: '2', C: '3' },
        slotConfigNames: ['B', 'C'], // C is azure-only sticky
      }),
    );
    expect(r.slotConfigNames).toContain('A');
    expect(r.slotConfigNames).toContain('C');
    expect(r.slotConfigNames).not.toContain('B');
  });

  it('deduplicates slot config names in merge', () => {
    const r = resolveApply(
      'merge',
      [setting({ name: 'A', slotSetting: true })],
      state({ slotConfigNames: ['A', 'A'] }),
    );
    expect(r.slotConfigNames.filter((n) => n === 'A')).toHaveLength(1);
  });
});

describe('resolveApply (replace)', () => {
  it('replaces all settings with local-only by default', () => {
    const r = resolveApply(
      'replace',
      [setting({ name: 'A', value: '1' })],
      state({ appSettings: { A: 'old', B: '2' } }),
    );
    expect(r.settings).toEqual({ A: '1' });
    expect(r.deletedNames).toEqual(['B']);
  });

  it('preserves reserved settings when preserveReserved=true (default)', () => {
    const r = resolveApply(
      'replace',
      [setting({ name: 'A', value: '1' })],
      state({
        appSettings: {
          A: 'old',
          WEBSITE_NODE_DEFAULT_VERSION: '20',
          AzureWebJobsStorage: 'connstr',
          UNRELATED: 'gone',
        },
      }),
    );
    expect(r.settings).toEqual({
      A: '1',
      WEBSITE_NODE_DEFAULT_VERSION: '20',
      AzureWebJobsStorage: 'connstr',
    });
    expect(r.preservedReserved).toEqual(
      expect.arrayContaining(['WEBSITE_NODE_DEFAULT_VERSION', 'AzureWebJobsStorage']),
    );
    expect(r.deletedNames).toEqual(['UNRELATED']);
  });

  it('deletes reserved when preserveReserved=false', () => {
    const r = resolveApply(
      'replace',
      [setting({ name: 'A', value: '1' })],
      state({ appSettings: { A: 'old', WEBSITE_NODE_DEFAULT_VERSION: '20' } }),
      { preserveReserved: false },
    );
    expect(r.settings).toEqual({ A: '1' });
    expect(r.deletedNames).toEqual(['WEBSITE_NODE_DEFAULT_VERSION']);
    expect(r.preservedReserved).toEqual([]);
  });

  it('local-marked sticky becomes the new sticky list (no Azure carry-over)', () => {
    const r = resolveApply(
      'replace',
      [setting({ name: 'A', slotSetting: true })],
      state({ slotConfigNames: ['B', 'C'] }),
    );
    expect(r.slotConfigNames).toEqual(['A']);
  });

  it('preserves slot stickiness for reserved settings carried over', () => {
    // Regression: previously slotConfigNames was just localSticky, which
    // silently dropped Azure-side stickiness for preserved reserved names.
    const r = resolveApply(
      'replace',
      [setting({ name: 'A', value: '1', slotSetting: true })],
      state({
        appSettings: { A: 'old', AzureWebJobsStorage: 'connstr' },
        slotConfigNames: ['AzureWebJobsStorage'],
      }),
    );
    expect(r.preservedReserved).toContain('AzureWebJobsStorage');
    expect(r.slotConfigNames).toContain('A');
    expect(r.slotConfigNames).toContain('AzureWebJobsStorage');
  });

  it('does not duplicate sticky entries when reserved is also locally sticky', () => {
    const r = resolveApply(
      'replace',
      [setting({ name: 'AzureWebJobsStorage', value: 'overridden', slotSetting: true })],
      state({
        appSettings: { AzureWebJobsStorage: 'old' },
        slotConfigNames: ['AzureWebJobsStorage'],
      }),
    );
    expect(r.slotConfigNames.filter((n) => n === 'AzureWebJobsStorage')).toHaveLength(1);
  });

  it('local overrides reserved with same name', () => {
    const r = resolveApply(
      'replace',
      [setting({ name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '22' })],
      state({ appSettings: { WEBSITE_NODE_DEFAULT_VERSION: '20' } }),
    );
    expect(r.settings).toEqual({ WEBSITE_NODE_DEFAULT_VERSION: '22' });
    expect(r.preservedReserved).toEqual([]);
  });
});
