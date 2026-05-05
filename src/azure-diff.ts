import type { AzureSetting } from './azure-export.js';
import type { AppState } from './azure-client.js';

export type DiffEntryKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffEntry {
  kind: DiffEntryKind;
  name: string;
  localValue?: string;
  azureValue?: string;
  localSticky?: boolean;
  azureSticky?: boolean;
  stickyChanged: boolean;
}

export interface SettingsDiff {
  entries: DiffEntry[];
  hasChanges: boolean;
}

const KIND_ORDER: Record<DiffEntryKind, number> = {
  added: 0,
  changed: 1,
  removed: 2,
  unchanged: 3,
};

export function diffSettings(
  local: AzureSetting[],
  azure: AppState,
): SettingsDiff {
  const seen = new Set<string>();
  const azureSticky = new Set(azure.slotConfigNames);
  const entries: DiffEntry[] = [];

  for (const l of local) {
    seen.add(l.name);
    const azureValue = azure.appSettings[l.name];
    const localSticky = l.slotSetting;
    const isSticky = azureSticky.has(l.name);
    const stickyChanged = localSticky !== isSticky;

    if (azureValue === undefined) {
      entries.push({
        kind: 'added',
        name: l.name,
        localValue: l.value,
        localSticky,
        azureSticky: isSticky,
        stickyChanged,
      });
    } else if (azureValue !== l.value) {
      entries.push({
        kind: 'changed',
        name: l.name,
        localValue: l.value,
        azureValue,
        localSticky,
        azureSticky: isSticky,
        stickyChanged,
      });
    } else {
      entries.push({
        kind: 'unchanged',
        name: l.name,
        localValue: l.value,
        azureValue,
        localSticky,
        azureSticky: isSticky,
        stickyChanged,
      });
    }
  }

  for (const azureName of Object.keys(azure.appSettings)) {
    if (seen.has(azureName)) continue;
    entries.push({
      kind: 'removed',
      name: azureName,
      azureValue: azure.appSettings[azureName],
      azureSticky: azureSticky.has(azureName),
      stickyChanged: false,
    });
  }

  entries.sort((a, b) => {
    const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (k !== 0) return k;
    return a.name.localeCompare(b.name);
  });

  const hasChanges = entries.some(
    (e) => e.kind !== 'unchanged' || e.stickyChanged,
  );

  return { entries, hasChanges };
}
