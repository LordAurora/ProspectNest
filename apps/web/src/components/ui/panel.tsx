import { cn } from '@/lib/cn';

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('rounded-panel border border-border bg-surface', className)}>{children}</section>;
}

export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-[12px] text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em] text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[14px] text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
