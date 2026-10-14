import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-2 max-w-md text-sm text-muted">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="loading-spiral" />
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-danger/30 bg-danger/10 px-4 py-4">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
