import { cn } from '@/lib/cn';

/** Only the table region scrolls horizontally; the page never does. */
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-[14px]', className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-muted">
      <tr className="border-b border-border">{children}</tr>
    </thead>
  );
}

type Align = 'left' | 'right';

export function TH({ className, align = 'left', children }: { className?: string; align?: Align; children?: React.ReactNode }) {
  return (
    <th
      scope="col"
      className={cn(
        'h-9 px-4 text-[12px] font-medium whitespace-nowrap text-fg-muted',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TR({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <tr className={cn('border-b border-border transition-colors duration-150 last:border-b-0 hover:bg-surface-hover', className)}>
      {children}
    </tr>
  );
}

export function TD({
  className,
  align = 'left',
  numeric = false,
  children,
}: {
  className?: string;
  align?: Align;
  numeric?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <td className={cn('h-[52px] px-4 align-middle', align === 'right' && 'text-right', numeric && 'tabular-nums', className)}>
      {children}
    </td>
  );
}
