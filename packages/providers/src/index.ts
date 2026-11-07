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

export type DiscoveryStatus =
  | { status: 'not_configured'; reason: string }
  | { status: 'unsupported'; providerId: string; reason: string }
  | { status: 'ready'; provider: ProviderInfo };

/**
 * Google Places API (New). Per the Google Maps Platform policies, place IDs
 * may be stored indefinitely, but other Places content may not be cached,
 * exported or copied to build a saved list. Discovery therefore keeps only
 * place IDs; details are shown live with attribution and never exported.
 */
export const googlePlacesProvider: ProviderInfo = {
  id: 'google_places',
  name: 'Google Places',
  capabilities: {
    supportsDiscovery: true,
    canPersist: false,
    canExport: false,
    canAnalyze: false,
    attribution: 'Google Maps',
    retentionPolicy: 'Yalnız place_id süresiz saklanır; ad, adres, telefon ve web sitesi saklanmaz, gösterim anında canlı alınır.',
    rateLimitPolicy: 'Ücretli API; günlük istek sınırı GOOGLE_PLACES_DAILY_REQUEST_LIMIT ile uygulanır.',
  },
};

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
 * Resolves the configured discovery source. A provider is "ready" only when
 * its credentials are present; nothing synthetic is ever returned.
 */
export function resolveDiscoveryProvider(configured: string, credentials: { googlePlacesApiKey?: string | undefined } = {}): DiscoveryStatus {
  if (!configured || configured === 'none') {
    return {
      status: 'not_configured',
      reason: 'Canlı keşif için bağlantı gerekli. Bir keşif sağlayıcısı yapılandırılmadı.',
    };
  }
  if (configured === googlePlacesProvider.id) {
    return credentials.googlePlacesApiKey
      ? { status: 'ready', provider: googlePlacesProvider }
      : {
          status: 'not_configured',
          reason: "GOOGLE_PLACES_API_KEY tanımlı değil. Google Cloud Console'da Places API (New) ve faturalandırma etkinleştirilmeli.",
        };
  }
  return { status: 'unsupported', providerId: configured, reason: `"${configured}" için bir adaptör bulunmuyor.` };
}
