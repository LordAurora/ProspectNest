import type { BusinessInput } from '@prospectnest/core';

/**
 * Documented policy of a data source. These are adapter facts taken from the
 * provider's terms, not switches a user can flip.
 */
export type ProviderCapabilities = {
  supportsDiscovery: boolean;
  canPersist: boolean;
  canExport: boolean;
  canAnalyze: boolean;
  attribution: string;
  retentionPolicy: string;
  rateLimitPolicy: string;
};

export type ProviderInfo = {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
};

export type DiscoveryQuery = {
  countries: string[];
  cities: string[];
  categories: string[];
  limit: number;
};

export type DiscoveryResult = {
  externalId: string;
  sourceUrl: string | null;
  business: BusinessInput;
};

export interface DiscoveryProvider extends ProviderInfo {
  discover(query: DiscoveryQuery, signal: AbortSignal): Promise<DiscoveryResult[]>;
}

export type DiscoveryStatus =
  | { status: 'not_configured'; reason: string }
  | { status: 'unsupported'; providerId: string; reason: string }
  | { status: 'ready'; provider: DiscoveryProvider };

/** User-owned or permitted files: the user is responsible for the source licence. */
export const csvProvider: ProviderInfo = {
  id: 'csv',
  name: 'CSV içe aktarma',
  capabilities: {
    supportsDiscovery: false,
    canPersist: true,
    canExport: true,
    canAnalyze: true,
    attribution: 'Kullanıcı tarafından yüklenen dosya',
    retentionPolicy: 'Kullanıcı silene kadar saklanır',
    rateLimitPolicy: 'Yok',
  },
};

export const manualProvider: ProviderInfo = {
  id: 'manual',
  name: 'Manuel kayıt',
  capabilities: { ...csvProvider.capabilities, attribution: 'Kullanıcı tarafından girildi' },
};

export const demoProvider: ProviderInfo = {
  id: 'demo',
  name: 'Sentetik demo verisi',
  capabilities: {
    ...csvProvider.capabilities,
    // Synthetic rows must never leave the system as if they were real leads.
    canExport: false,
    attribution: 'Sentetik demo verisi',
  },
};

const importProviders: Record<string, ProviderInfo> = {
  csv: csvProvider,
  manual: manualProvider,
  demo: demoProvider,
};

export const getImportProvider = (id: string): ProviderInfo | undefined => importProviders[id];

/**
 * No live discovery adapter ships yet. Choosing one requires verifying that its
 * terms allow search, storage and commercial export; until then discovery
 * reports `not_configured` and nothing synthetic is ever returned.
 */
const discoveryAdapters: Record<string, () => DiscoveryProvider> = {};

export function resolveDiscoveryProvider(configured: string): DiscoveryStatus {
  if (!configured || configured === 'none') {
    return {
      status: 'not_configured',
      reason: 'Canlı keşif için bağlantı gerekli. Arama ve saklamaya izin veren bir sağlayıcı seçilmedi.',
    };
  }
  const factory = discoveryAdapters[configured];
  if (!factory) {
    return {
      status: 'unsupported',
      providerId: configured,
      reason: `"${configured}" için bir adaptör bulunmuyor.`,
    };
  }
  return { status: 'ready', provider: factory() };
}
