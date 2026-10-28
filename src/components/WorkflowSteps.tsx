// Frise de progression d'un document : étapes franchies (pleines), étape courante (pulsée), à venir (grises).
export function WorkflowSteps({ steps, current, failed }: { steps: string[]; current: number; failed?: string }) {
  return (
    <ol className="card flex items-center gap-1 overflow-x-auto px-4 py-3" aria-label="Progression du document">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current && !failed;
        return (
          <li key={s} className="flex min-w-fit flex-1 items-center gap-2" aria-current={now ? "step" : undefined}>
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors duration-500 ${
                done ? "bg-ink text-white" : now ? "pulse-dot bg-brand text-white text-brand/40" : "bg-mist text-muted"
              }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={`whitespace-nowrap text-xs font-medium ${done || now ? "text-ink" : "text-muted"}`}>{s}</span>
            {i < steps.length - 1 ? (
              <span className="mx-1 h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-mist">
                <span className={`block h-full rounded-full bg-ink ${done ? "grow-x" : "w-0"}`} style={{ animationDelay: `${i * 90}ms` }} />
              </span>
            ) : null}
          </li>
        );
      })}
      {failed ? <li className="ml-2 chip shrink-0 bg-rose-50 text-rose-700">{failed}</li> : null}
    </ol>
  );
}
