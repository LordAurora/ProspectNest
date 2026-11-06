export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Yükleniyor" className="animate-pulse">
      <div className="mb-2 h-7 w-48 rounded-control bg-surface-muted" />
      <div className="mb-8 h-4 w-80 max-w-full rounded-control bg-surface-muted" />
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border bg-border lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[76px] bg-surface" />
        ))}
      </div>
      <div className="h-80 rounded-panel border border-border bg-surface" />
    </div>
  );
}
