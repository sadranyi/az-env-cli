import { DefaultAzureCredential, type TokenCredential } from '@azure/identity';
import {
  WebSiteManagementClient,
  type StringDictionary,
  type SlotConfigNamesResource,
} from '@azure/arm-appservice';

export interface AzureTarget {
  subscriptionId: string;
  resourceGroup: string;
  name: string;
  slot?: string;
}

export interface AppState {
  appSettings: Record<string, string>;
  slotConfigNames: string[];
  kind: string;
}

export interface AzureClient {
  fetchState(): Promise<AppState>;
  applySettings(settings: Record<string, string>): Promise<void>;
  applySlotConfigNames(names: string[]): Promise<void>;
}

export type AzureClientFactory = (target: AzureTarget) => AzureClient;

export function createAzureClient(
  target: AzureTarget,
  credential?: TokenCredential,
): AzureClient {
  const cred = credential ?? new DefaultAzureCredential();
  const client = new WebSiteManagementClient(cred, target.subscriptionId);
  const { resourceGroup, name, slot } = target;

  return {
    async fetchState(): Promise<AppState> {
      const [settingsResp, slotConfigResp, siteResp] = await Promise.all([
        slot
          ? client.webApps.listApplicationSettingsSlot(resourceGroup, name, slot)
          : client.webApps.listApplicationSettings(resourceGroup, name),
        client.webApps.listSlotConfigurationNames(resourceGroup, name),
        slot
          ? client.webApps.getSlot(resourceGroup, name, slot)
          : client.webApps.get(resourceGroup, name),
      ]);

      const properties = settingsResp.properties ?? {};
      const appSettings: Record<string, string> = {};
      for (const [k, v] of Object.entries(properties)) {
        if (typeof v === 'string') appSettings[k] = v;
      }

      return {
        appSettings,
        slotConfigNames: slotConfigResp.appSettingNames ?? [],
        kind: siteResp.kind ?? 'app',
      };
    },

    async applySettings(settings: Record<string, string>): Promise<void> {
      const body: StringDictionary = { properties: settings };
      if (slot) {
        await client.webApps.updateApplicationSettingsSlot(
          resourceGroup,
          name,
          slot,
          body,
        );
      } else {
        await client.webApps.updateApplicationSettings(resourceGroup, name, body);
      }
    },

    async applySlotConfigNames(names: string[]): Promise<void> {
      const dedupedNames = Array.from(new Set(names));
      const body: SlotConfigNamesResource = {
        appSettingNames: dedupedNames,
      };
      await client.webApps.updateSlotConfigurationNames(resourceGroup, name, body);
    },
  };
}
