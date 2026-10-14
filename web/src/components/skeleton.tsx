import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-surface-2", className)}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Skeleton className="mb-3 h-5 w-1/3" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-2 h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Skeleton className="mb-2 h-8 w-20" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-[9/16] w-full" />
      <div className="p-4">
        <Skeleton className="mb-2 h-5 w-3/4" />
        <Skeleton className="mb-3 h-4 w-1/2" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <Skeleton className="mb-4 h-6 w-1/4" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
