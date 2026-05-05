import { describe, it, expect } from 'vitest';
import { diffSettings } from '../src/azure-diff.js';
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

describe('diffSettings', () => {
  it('reports no changes for empty inputs', () => {
    const d = diffSettings([], state());
    expect(d.entries).toEqual([]);
    expect(d.hasChanges).toBe(false);
  });

  it('flags local-only entries as added', () => {
    const d = diffSettings([setting({ name: 'A', value: '1' })], state());
    expect(d.entries[0]).toMatchObject({ kind: 'added', name: 'A', localValue: '1' });
    expect(d.hasChanges).toBe(true);
  });

  it('flags azure-only entries as removed', () => {
    const d = diffSettings([], state({ appSettings: { A: '1' } }));
    expect(d.entries[0]).toMatchObject({ kind: 'removed', name: 'A', azureValue: '1' });
    expect(d.entries[0].stickyChanged).toBe(false);
    expect(d.hasChanges).toBe(true);
  });

  it('flags differing values as changed', () => {
    const d = diffSettings(
      [setting({ name: 'A', value: '1' })],
      state({ appSettings: { A: '2' } }),
    );
    expect(d.entries[0]).toMatchObject({
      kind: 'changed',
      name: 'A',
      localValue: '1',
      azureValue: '2',
    });
  });

  it('flags identical entries as unchanged with hasChanges=false', () => {
    const d = diffSettings(
      [setting({ name: 'A', value: '1' })],
      state({ appSettings: { A: '1' } }),
    );
    expect(d.entries[0].kind).toBe('unchanged');
    expect(d.hasChanges).toBe(false);
  });

  it('detects sticky bit added (local sticky, Azure not)', () => {
    const d = diffSettings(
      [setting({ name: 'A', value: '1', slotSetting: true })],
      state({ appSettings: { A: '1' }, slotConfigNames: [] }),
    );
    expect(d.entries[0].kind).toBe('unchanged');
    expect(d.entries[0].stickyChanged).toBe(true);
    expect(d.entries[0].localSticky).toBe(true);
    expect(d.entries[0].azureSticky).toBe(false);
    expect(d.hasChanges).toBe(true);
  });

  it('detects sticky bit removed (Azure sticky, local not)', () => {
    const d = diffSettings(
      [setting({ name: 'A', value: '1', slotSetting: false })],
      state({ appSettings: { A: '1' }, slotConfigNames: ['A'] }),
    );
    expect(d.entries[0].kind).toBe('unchanged');
    expect(d.entries[0].stickyChanged).toBe(true);
  });

  it('does not flag stickyChanged for azure-only sticky names', () => {
    const d = diffSettings(
      [],
      state({ appSettings: { A: '1' }, slotConfigNames: ['A'] }),
    );
    expect(d.entries[0].kind).toBe('removed');
    expect(d.entries[0].stickyChanged).toBe(false);
  });

  it('compares Key Vault refs as literal strings', () => {
    const ref = '@Microsoft.KeyVault(VaultName=v;SecretName=S)';
    const d = diffSettings(
      [setting({ name: 'PWD', value: ref })],
      state({ appSettings: { PWD: ref } }),
    );
    expect(d.entries[0].kind).toBe('unchanged');
  });

  it('flags KV ref vs literal as changed', () => {
    const d = diffSettings(
      [setting({ name: 'PWD', value: '@Microsoft.KeyVault(VaultName=v;SecretName=S)' })],
      state({ appSettings: { PWD: 'plaintext' } }),
    );
    expect(d.entries[0].kind).toBe('changed');
  });

  it('orders entries: added, changed, removed, unchanged', () => {
    const d = diffSettings(
      [
        setting({ name: 'B', value: 'b' }), // unchanged
        setting({ name: 'C', value: '2' }), // changed
        setting({ name: 'A', value: 'new' }), // added
      ],
      state({
        appSettings: { B: 'b', C: '1', D: 'gone' },
      }),
    );
    expect(d.entries.map((e) => e.name)).toEqual(['A', 'C', 'D', 'B']);
    expect(d.entries.map((e) => e.kind)).toEqual([
      'added',
      'changed',
      'removed',
      'unchanged',
    ]);
  });

  it('within same kind, sorts by name', () => {
    const d = diffSettings(
      [setting({ name: 'B' }), setting({ name: 'A' })],
      state(),
    );
    expect(d.entries.map((e) => e.name)).toEqual(['A', 'B']);
  });
});
