import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * Design options — preview-only "Opsioni" switcher (round 6).
 *
 * Owner 2026-11-02: "I LOOVEEEE the opsioni button!!! Add allllll our design
 * as options ... 7+ options per component". Every visual slot we are working
 * on renders through <DesignSlot>, which shows option 1 (the current pick) on
 * advance.al and, on preview/local hosts only, a numbered switcher under it.
 *
 * Picks persist per slot (localStorage) and can be forced with
 * ?d=slotId:3,otherSlot:5. The floating <DesignPicks> panel lists every pick
 * so the owner can copy them and send them back.
 */

export type DesignOption = {
  /** short name shown next to the number */
  name: string;
  render: () => ReactNode;
};

export const designPreview =
  typeof window !== "undefined" &&
  /(\.vercel\.app|localhost|127\.0\.0\.1)$/.test(window.location.hostname);

const KEY = "advance-design-picks";
type Picks = Record<string, number>;
const listeners = new Set<() => void>();
const registry = new Map<string, { title: string; names: string[] }>();

function readStored(): Picks {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Picks;
  } catch {
    return {};
  }
}

let picks: Picks = {};
if (designPreview) {
  picks = readStored();
  const q = new URLSearchParams(window.location.search).get("d");
  if (q) {
    for (const part of q.split(",")) {
      const [id, n] = part.split(":");
      const v = Number(n) - 1;
      if (id && Number.isInteger(v) && v >= 0) picks[id] = v;
    }
  }
}

function setPick(id: string, i: number) {
  picks = { ...picks, [id]: i };
  try {
    localStorage.setItem(KEY, JSON.stringify(picks));
  } catch {
    /* private mode: picks still work for this page view */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const snapshot = () => picks;

export function useDesignPicks() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

interface DesignSlotProps {
  /** stable id, e.g. "emp-hero" */
  id: string;
  /** human title for the picks panel, e.g. "Punëdhënës — hero" */
  title: string;
  options: DesignOption[];
  /** classes for the switcher row (alignment) */
  switcherClassName?: string;
  /** optional frame around the rendered option (the switcher stays outside) */
  wrap?: (node: ReactNode) => ReactNode;
  /** the visual is hidden on phones in production; preview shows it anyway with a note */
  phoneNote?: boolean;
}

export function DesignSlot({ id, title, options, switcherClassName = "justify-center", wrap = (n) => n, phoneNote = false }: DesignSlotProps) {
  const all = useDesignPicks();
  const raw = all[id] ?? 0;
  const i = raw >= 0 && raw < options.length ? raw : 0;

  useEffect(() => {
    registry.set(id, { title, names: options.map((o) => o.name) });
    listeners.forEach((l) => l());
  }, [id, title, options]);

  if (!designPreview) return <>{wrap(options[0].render())}</>;

  return (
    <>
      {wrap(<div key={i} className="contents">{options[i].render()}</div>)}
      <div
        className={`mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500 ${switcherClassName}`}
        data-design-slot={id}
      >
        <span className="mr-1 font-medium">Opsioni:</span>
        {options.map((o, k) => (
          <button
            key={k}
            type="button"
            title={o.name}
            aria-label={`Opsioni ${k + 1}: ${o.name}`}
            aria-pressed={k === i}
            onClick={() => setPick(id, k)}
            className={`h-7 min-w-7 rounded-md border px-1.5 text-xs font-semibold ${
              k === i ? "border-[#2F65BE] bg-[#2F65BE] text-white" : "border-slate-300 bg-white text-slate-700 hover:border-[#2F65BE]"
            }`}
          >
            {k + 1}
          </button>
        ))}
        <span className="ml-1 w-full text-center text-[11px] text-slate-400 sm:w-auto sm:text-left">{options[i].name}</span>
        {phoneNote && (
          <span className="w-full text-center text-[11px] text-amber-700 md:hidden">
            Në telefon ky imazh nuk shfaqet në faqen e vërtetë — e shihni këtu vetëm për ta zgjedhur.
          </span>
        )}
      </div>
    </>
  );
}

/** Floating panel (preview only): every slot's current pick + copy button. */
export function DesignPicks() {
  const all = useDesignPicks();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!designPreview) return null;
  const rows = [...registry.entries()].map(([id, r]) => {
    const n = (all[id] ?? 0) + 1;
    return { id, title: r.title, n, name: r.names[n - 1] ?? "", total: r.names.length };
  });
  const text = rows.map((r) => `${r.title}: ${r.n} (${r.name})`).join("\n");
  return (
    <div className="fixed bottom-4 left-4 z-[60] text-sm">
      {open && (
        <div className="mb-2 w-[min(88vw,340px)] rounded-xl border border-slate-200 bg-white p-3 text-slate-700 shadow-lg">
          <div className="mb-2 font-semibold text-[#0B2A6B]">Zgjedhjet e mia</div>
          {rows.length === 0 && <div className="text-xs text-slate-500">Asnjë opsion në këtë faqe.</div>}
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 text-xs">
                <span className="truncate">{r.title}</span>
                <span className="shrink-0 font-semibold">
                  {r.n}/{r.total}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 w-full rounded-md bg-[#2F65BE] py-1.5 text-xs font-semibold text-white"
            onClick={() => {
              navigator.clipboard?.writeText(text).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "U kopjua" : "Kopjo zgjedhjet"}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-[#2F65BE] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F65BE]"
      >
        Opsionet {open ? "▾" : "▸"}
      </button>
    </div>
  );
}
