export function ComingSoonPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-ink-dim">{phase}</p>
    </div>
  )
}
