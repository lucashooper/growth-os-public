export function PageHeader({
  title,
  action,
  children,
}: {
  title: string;
  /** @deprecated descriptions are no longer shown — Linear/Postiz-style titles only */
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const right = children ?? action;
  return (
    <header className="flex w-full shrink-0 items-center justify-between border-b border-white/[0.06] bg-bg px-8 py-5">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      {right ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {right}
        </div>
      ) : null}
    </header>
  );
}

export function PageBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex-1 overflow-y-auto px-8 py-6 ${className}`.trim()}>
      {children}
    </div>
  );
}
