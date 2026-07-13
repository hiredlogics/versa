import { cn } from "@/lib/utils/cn";

export function AdminDataTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-glass-border", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function AdminTableHead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-charcoal-card text-left text-xs uppercase tracking-wide text-muted">{children}</thead>;
}

export function AdminTableRow({ children }: { children: React.ReactNode }) {
  return <tr className="border-t border-glass-border hover:bg-white/[0.02]">{children}</tr>;
}

export function AdminTableCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("p-3 align-middle text-off-white", className)}>{children}</td>;
}

export function AdminTableHeaderCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={cn("p-3 font-medium", className)}>{children}</th>;
}

export function AdminEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-glass-border p-10 text-center text-sm text-muted">
      {message}
    </div>
  );
}
