import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-control border border-border bg-surface-muted text-fg-muted">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-[14px] font-medium text-fg">{title}</p>
      {description ? <div className="mt-1 max-w-sm text-[13px] text-fg-muted">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
