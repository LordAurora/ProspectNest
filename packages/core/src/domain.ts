/**
 * Shared domain vocabulary. Values mirror the Prisma enums; labels are the
 * Turkish UI strings and live here so web and exports stay consistent.
 */

export const RUN_STATUSES = [
  'queued',
  'running',
  'partial',
  'completed',
  'failed',
  'cancelled',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const runStatusLabel: Record<RunStatus, string> = {
  queued: 'Sırada',
  running: 'Çalışıyor',
  partial: 'Kısmi',
  completed: 'Tamamlandı',
  failed: 'Başarısız',
  cancelled: 'İptal edildi',
};

export const RUN_ITEM_STATUSES = ['pending', 'running', 'done', 'failed', 'skipped', 'blocked'] as const;
export type RunItemStatus = (typeof RUN_ITEM_STATUSES)[number];

export const runItemStatusLabel: Record<RunItemStatus, string> = {
  pending: 'Bekliyor',
  running: 'İnceleniyor',
  done: 'Tamamlandı',
  failed: 'Başarısız',
  skipped: 'Atlandı',
  blocked: 'Engellendi',
};

export const RUN_KINDS =['import', 'research', 'discovery', 'recheck', 'sync'] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const runKindLabel: Record<RunKind, string> = {
  import: 'İçe aktarma',
  research: 'Araştırma',
  discovery: 'Keşif',
  recheck: 'Yeniden kontrol',
  sync: 'Aktarım',
};

export const PRIORITIES =['high', 'medium', 'low', 'not_evaluated'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const priorityLabel: Record<Priority, string> = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
  not_evaluated: 'Değerlendirilemedi',
};

export const LEAD_STATUSES = ['new', 'reviewing', 'contacted', 'qualified', 'rejected'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const leadStatusLabel: Record<LeadStatus, string> = {
  new: 'Yeni',
  reviewing: 'İnceleniyor',
  contacted: 'İletişime geçildi',
  qualified: 'Uygun',
  rejected: 'Elendi',
};

/** present: seen on inspected pages; not_observed: inspected but absent; unknown: could not inspect. */
export const OBSERVATION_STATUSES = ['present', 'not_observed', 'unknown'] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

export const observationStatusLabel: Record<ObservationStatus, string> = {
  present: 'Bulundu',
  not_observed: 'İncelenen sayfalarda bulunamadı',
  unknown: 'Bilinmiyor',
};

export const SERVICE_TEMPLATES = ['qr_menu', 'website', 'appointment', 'reservation', 'ecommerce'] as const;
export type ServiceTemplate = (typeof SERVICE_TEMPLATES)[number];

export const serviceTemplateLabel: Record<ServiceTemplate, string> = {
  qr_menu: 'QR menü',
  website: 'Web sitesi',
  appointment: 'Randevu sistemi',
  reservation: 'Rezervasyon',
  ecommerce: 'E-ticaret',
};

/** Worker is considered alive if it reported within this window. */
export const WORKER_HEARTBEAT_STALE_MS = 90_000;
export const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;

export const QUEUES = {
  research: 'research',
  maintenance: 'maintenance',
} as const;
