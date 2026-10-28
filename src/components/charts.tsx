"use client";
// Graphiques SVG sur mesure, légers et animés une seule fois à l'apparition (désactivés si mouvement réduit).
import { useMemo, useState } from "react";
import { formatCents } from "@/lib/format";
import { CountUp, useInView } from "./Motion";

const compact = (c: number) => {
  const mad = c / 100;
  if (Math.abs(mad) >= 1_000_000) return `${(mad / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(mad) >= 1_000) return `${Math.round(mad / 1_000)} k`;
  return `${Math.round(mad)}`;
};

// ------------------------------------------------------------------ Jauge (arc 240°)

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, to);
  const e = polar(cx, cy, r, from);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 0 ${e.x} ${e.y}`;
}

export function GaugeChart({ value, total, label }: { value: number; total: number; label: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const rate = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  const path = arc(110, 110, 88, -120, 120);
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[240px]">
      <svg viewBox="0 0 220 180" className="w-full" role="img" aria-label={`${label} : ${Math.round(rate * 100)} %`}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#fc6503" />
            <stop offset="55%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="#edf0f2" strokeWidth={12} strokeLinecap="round" />
        <path d={path} fill="none" stroke="url(#gauge-grad)" strokeWidth={12} strokeLinecap="round" pathLength={1}
          strokeDasharray={1} strokeDashoffset={inView ? 1 - rate : 1}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <div className="absolute inset-x-0 top-[34%] text-center">
        <p className="text-[20px] leading-none font-bold tracking-tight whitespace-nowrap"><CountUp cents={value} currency="" /><span className="ml-1 text-xs font-semibold text-muted">MAD</span></p>
        <p className="mt-1.5 text-xs text-muted">{label}</p>
        <p className="mt-2 inline-flex whitespace-nowrap rounded-full bg-mist px-2.5 py-1 text-[11px] font-semibold tabular">{Math.round(rate * 100)} % de {formatCents(total)}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Flux du pipeline (bandes dégradées)

export function PipelineFlow({ stages }: { stages: { key: string; label: string; count: number; amount: number }[] }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const W = 640, H = 176, PAD = 36, MID = 92, MAXT = 100;
  const max = Math.max(1, ...stages.map((s) => s.amount));
  const xs = stages.map((_, i) => PAD + (i * (W - PAD * 2)) / Math.max(1, stages.length - 1));
  const band = (k: number) => {
    const t = stages.map((s) => Math.max(5, (s.amount / max) * MAXT * k) / 2);
    let top = `M ${xs[0] - PAD} ${MID - t[0]} L ${xs[0]} ${MID - t[0]}`;
    let bot = "";
    for (let i = 1; i < xs.length; i++) {
      const cx = (xs[i - 1] + xs[i]) / 2;
      top += ` C ${cx} ${MID - t[i - 1]}, ${cx} ${MID - t[i]}, ${xs[i]} ${MID - t[i]}`;
    }
    const n = xs.length - 1;
    top += ` L ${xs[n] + PAD} ${MID - t[n]} L ${xs[n] + PAD} ${MID + t[n]} L ${xs[n]} ${MID + t[n]}`;
    for (let i = n; i > 0; i--) {
      const cx = (xs[i - 1] + xs[i]) / 2;
      bot += ` C ${cx} ${MID + t[i]}, ${cx} ${MID + t[i - 1]}, ${xs[i - 1]} ${MID + t[i - 1]}`;
    }
    return `${top}${bot} L ${xs[0] - PAD} ${MID + t[0]} Z`;
  };
  const first = stages[0]?.amount || 1;
  return (
    <div ref={ref}>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Pipeline du devis à l'encaissement">
          <defs>
            <linearGradient id="flow-grad" x1="0" x2="1">
              <stop offset="0%" stopColor="#fc6503" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
            <clipPath id="flow-reveal">
              <rect x="0" y="0" width={W} height={H}
                style={{ transformBox: "fill-box", transformOrigin: "left", transform: inView ? "scaleX(1)" : "scaleX(0)", transition: "transform 1.3s cubic-bezier(0.22,1,0.36,1)" }} />
            </clipPath>
          </defs>
          <g clipPath="url(#flow-reveal)">
            <path d={band(1)} fill="url(#flow-grad)" opacity={0.18} />
            <path d={band(0.72)} fill="url(#flow-grad)" opacity={0.35} />
            <path d={band(0.42)} fill="url(#flow-grad)" opacity={0.95} />
          </g>
          {xs.map((x, i) => (
            <line key={i} x1={x} x2={x} y1={26} y2={H - 26} stroke="#101720" strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="2 4" />
          ))}
        </svg>
        {/* Pastilles de conversion (au-dessus) et volumes (au-dessous), positionnées en % de la largeur */}
        {stages.map((s, i) => (
          <div key={s.key} className="pointer-events-none absolute" style={{ left: `${(xs[i] / W) * 100}%`, top: 0, transform: "translateX(-50%)" }}>
            <span className={`pill-value transition-opacity duration-500 ${inView ? "opacity-100" : "opacity-0"}`} style={{ transitionDelay: `${300 + i * 120}ms` }}>
              {Math.round((s.amount / first) * 100)} %
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {stages.map((s) => (
          <div key={s.key} className="text-center">
            <p className="text-[11px] font-medium text-muted">{s.label}</p>
            <p className="text-sm font-bold tabular">{compact(s.amount)} <span className="text-[11px] font-medium text-muted">MAD</span></p>
            <p className="text-[11px] text-muted tabular">{s.count} devis</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Tendance (courbes lissées + curseur)

function smooth(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function TrendChart({ points }: { points: { label: string; invoiced: number; collected: number }[] }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 240, L = 44, R = 16, T = 18, B = 30;
  const geo = useMemo(() => {
    const raw = Math.max(1, ...points.flatMap((p) => [p.invoiced, p.collected]));
    const step = 10 ** Math.floor(Math.log10(raw));
    const max = Math.ceil(raw / step) * step;
    const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, points.length - 1);
    const y = (v: number) => T + (1 - Math.max(0, v) / max) * (H - T - B);
    const inv = points.map((p, i) => ({ x: x(i), y: y(p.invoiced) }));
    const col = points.map((p, i) => ({ x: x(i), y: y(p.collected) }));
    return { max, x, y, invD: smooth(inv), colD: smooth(col), inv, col };
  }, [points]);
  const h = hover != null ? points[hover] : null;
  const area = `${geo.invD} L ${geo.x(points.length - 1)} ${H - B} L ${geo.x(0)} ${H - B} Z`;
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" role="img" aria-label="Évolution mensuelle du facturé et de l'encaissé">
        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fc6503" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#fc6503" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="trend-line" x1="0" x2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fc6503" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={geo.y(geo.max * f)} y2={geo.y(geo.max * f)} stroke="#101720" strokeOpacity={0.06} />
            <text x={L - 8} y={geo.y(geo.max * f) + 3} textAnchor="end" className="fill-[#7f8691] text-[10px]">{compact(geo.max * f)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={i} x={geo.x(i)} y={H - 10} textAnchor="middle" className={`text-[10px] ${hover === i ? "fill-[#101720] font-semibold" : "fill-[#7f8691]"}`}>{p.label}</text>
        ))}
        <path d={area} fill="url(#trend-area)" className={`transition-opacity duration-700 ${inView ? "opacity-100" : "opacity-0"}`} />
        {inView ? (
          <>
            <path d={geo.colD} fill="none" stroke="#9aa3ad" strokeWidth={2.2} strokeLinecap="round" pathLength={1} className="draw-path" style={{ ["--len" as string]: 1 }} />
            <path d={geo.invD} fill="none" stroke="url(#trend-line)" strokeWidth={2.8} strokeLinecap="round" pathLength={1} className="draw-path" style={{ ["--len" as string]: 1 }} />
          </>
        ) : null}
        {hover != null ? (
          <g>
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={T - 6} y2={H - B} stroke="#101720" strokeWidth={1.2} strokeDasharray="3 4" />
            <circle cx={geo.x(hover)} cy={geo.col[hover].y} r={4.5} fill="white" stroke="#9aa3ad" strokeWidth={2.2} />
            <circle cx={geo.x(hover)} cy={geo.inv[hover].y} r={5.5} fill="white" stroke="#fc6503" strokeWidth={2.6} />
          </g>
        ) : null}
        {points.map((_, i) => (
          <rect key={i} x={geo.x(i) - (W - L - R) / points.length / 2} y={0} width={(W - L - R) / points.length} height={H}
            fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {h && hover != null ? (
        <div className="anim-pop pointer-events-none absolute z-10 -translate-x-1/2 rounded-2xl bg-ink px-3.5 py-2.5 text-white shadow-[var(--shadow-lift)]"
          style={{ left: `${(geo.x(hover) / W) * 100}%`, top: `${(Math.min(geo.inv[hover].y, geo.col[hover].y) / H) * 100 - 30}%` }}>
          <p className="text-[11px] text-white/60 capitalize">{h.label}</p>
          <p className="text-sm font-bold tabular"><span className="text-brand-2">●</span> {formatCents(h.invoiced)} <span className="text-[10px] font-normal text-white/60">facturé</span></p>
          <p className="text-sm font-semibold tabular"><span className="text-[#9aa3ad]">●</span> {formatCents(h.collected)} <span className="text-[10px] font-normal text-white/60">encaissé</span></p>
        </div>
      ) : null}
    </div>
  );
}
