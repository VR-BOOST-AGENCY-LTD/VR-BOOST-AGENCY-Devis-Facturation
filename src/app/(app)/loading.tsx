// Squelette affiché pendant le chargement d'une page (au lieu d'un écran figé).
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="anim-fade">
      <div className="mb-8 flex items-end justify-between">
        <div className="space-y-3">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-4 w-80" />
        </div>
        <div className="skeleton h-10 w-36 rounded-full" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-7 w-32" />
            <div className="skeleton h-2 w-full" />
          </div>
        ))}
      </div>
      <div className="card space-y-4 p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="skeleton h-4 w-28" />
            <div className="skeleton h-4 flex-1" />
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
