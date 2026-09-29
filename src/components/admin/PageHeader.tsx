export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-ink-soft">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
