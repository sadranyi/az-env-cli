import type { AzureSetting } from './azure-export.js';
import type { AppState } from './azure-client.js';

export type ApplyMode = 'merge' | 'replace';

export interface ResolveApplyOptions {
  preserveReserved?: boolean;
}

export interface ResolvedApply {
  settings: Record<string, string>;
  slotConfigNames: string[];
  deletedNames: string[];
  preservedReserved: string[];
}

const RESERVED_PREFIXES = ['WEBSITE_', 'FUNCTIONS_', 'APPINSIGHTS_', 'APPLICATIONINSIGHTS_'];
const RESERVED_EXACT = new Set(['AzureWebJobsStorage']);

export function isReservedName(name: string): boolean {
  if (RESERVED_EXACT.has(name)) return true;
  return RESERVED_PREFIXES.some((p) => name.startsWith(p));
}

export function resolveApply(
  mode: ApplyMode,
  local: AzureSetting[],
  azure: AppState,
  opts: ResolveApplyOptions = {},
): ResolvedApply {
  const preserveReserved = opts.preserveReserved ?? true;
  const localNames = new Set(local.map((s) => s.name));
  const localSticky = local.filter((s) => s.slotSetting).map((s) => s.name);
  const localAsRecord: Record<string, string> = Object.fromEntries(
    local.map((s) => [s.name, s.value]),
  );

  if (mode === 'merge') {
    const settings: Record<string, string> = { ...azure.appSettings, ...localAsRecord };

    const stickyOrdered: string[] = [...localSticky];
    for (const n of azure.slotConfigNames) {
      if (!localNames.has(n) && !stickyOrdered.includes(n)) {
        stickyOrdered.push(n);
      }
    }

    return {
      settings,
      slotConfigNames: stickyOrdered,
      deletedNames: [],
      preservedReserved: [],
    };
  }

  const deletedNames: string[] = [];
  const preservedReserved: string[] = [];
  const settings: Record<string, string> = { ...localAsRecord };

  for (const azureName of Object.keys(azure.appSettings)) {
    if (localNames.has(azureName)) continue;
    if (preserveReserved && isReservedName(azureName)) {
      settings[azureName] = azure.appSettings[azureName];
      preservedReserved.push(azureName);
    } else {
      deletedNames.push(azureName);
    }
  }

  return {
    settings,
    slotConfigNames: localSticky,
    deletedNames,
    preservedReserved,
  };
}
