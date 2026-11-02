import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

/**
 * Employers signup, left column: what an employer gets — applications for a
 * posted job arriving, ranked by match.
 *
 * Round 4 (owner, 2026-11-02): the people-arrow is out ("i hate the new
 * arrow") and the column must be as tall as the form next to it. So this is
 * HTML, not a fixed-ratio SVG: it fills whatever height the grid row gives it.
 * Same language as the loved "Kurse kohë" CV animation: flat SKY panel, ink
 * text, the brand blue, real product UI with real Albanian text. No figures,
 * gradients, glows or pill badges.
 *
 * Loop: every 1.8 s a new applicant slides in at the top (blue edge while it is
 * new), the counter goes up; the best match carries a check. Paused
 * off-screen. Reduced motion: a static list.
 */

const INK = "#0B2A6B";
const BLUE = "#2F65BE";
const SKY = "#EAF2FF";
const MUTED = "#64748B";

type Applicant = { name: string; role: string; match: number; initials: string };

const POOL: Applicant[] = [
  { name: "Arta Hoxha", role: "Kontabiliste, 4 vjet", match: 94, initials: "AH" },
  { name: "Ardit Dervishi", role: "Ekonomist", match: 81, initials: "AD" },
  { name: "Elira Gjoka", role: "Asistente financiare", match: 76, initials: "EG" },
  { name: "Besnik Krasniqi", role: "Kontabilist, 7 vjet", match: 91, initials: "BK" },
  { name: "Sara Brugu", role: "Analiste financiare", match: 85, initials: "SB" },
  { name: "Klaus Shehu", role: "Llogaritar", match: 72, initials: "KS" },
  { name: "Dorian Pasha", role: "Kontabilist i ri", match: 79, initials: "DP" },
  { name: "Genta Mehmeti", role: "Audituese", match: 88, initials: "GM" },
];

const VISIBLE = POOL.length; // fills a tall column; never shows the same person twice
const START = 6;
const STEP_MS = 1800;

type Row = Applicant & { key: number };

const initialRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ ...POOL[(n - 1 - i) % POOL.length], key: n - 1 - i }));

export function ApplicantsInbox({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const reduced = !!useReducedMotion();
  const [rows, setRows] = useState<Row[]>(() => initialRows(reduced ? 6 : START));
  const next = useRef(START);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = window.setInterval(() => {
      const k = next.current++;
      setRows((r) => [{ ...POOL[k % POOL.length], key: k }, ...r].slice(0, VISIBLE));
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [inView, reduced]);

  const total = 12 + (rows[0]?.key ?? 0);
  const best = rows.reduce((b, r) => (r.match > b.match ? r : b), rows[0]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Aplikimet e reja për një punë mbërrijnë një nga një, të renditura sipas përputhjes"
      className={`flex flex-col overflow-hidden rounded-2xl p-6 ${className}`}
      style={{ background: SKY, color: INK }}
    >
      <style>{`
        @keyframes ai-row-in { from { opacity: 0; transform: translateY(-14px); max-height: 0; margin-bottom: 0; }
                               to   { opacity: 1; transform: none; max-height: 80px; margin-bottom: 10px; } }
        @keyframes ai-row-edge { from { border-color: ${BLUE}; } to { border-color: #D5DFEE; } }
      `}</style>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-wider" style={{ color: MUTED }}>APLIKIME TË REJA</div>
          <div className="mt-1 text-[15px] font-bold">Kontabilist/e</div>
          <div className="text-[13px]" style={{ color: MUTED }}>Tiranë · me kohë të plotë</div>
        </div>
        <div className="text-right">
          <div className="text-[34px] font-extrabold leading-none tabular-nums">{total}</div>
          <div className="mt-1 text-[12px]" style={{ color: BLUE }}>këtë javë</div>
        </div>
      </div>

      <div className="mt-5 mb-2 flex justify-between text-[11px] font-semibold" style={{ color: MUTED }}>
        <span>Kandidati</span>
        <span>Përputhja</span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {rows.map((r, i) => {
          const fresh = !reduced && i === 0 && r.key >= START;
          const top = r.key === best.key;
          return (
            <div
              key={r.key}
              className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5"
              style={{
                marginBottom: 10,
                border: `1.5px solid ${top ? BLUE : "#D5DFEE"}`,
                animation: fresh ? `ai-row-in 450ms ease-out${top ? "" : ", ai-row-edge 1400ms ease-in 450ms both"}` : undefined,
              }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                style={{ background: top ? BLUE : r.match >= 85 ? INK : "#9FB0C8" }}
              >
                {r.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{r.name}</div>
                <div className="truncate text-[12px]" style={{ color: MUTED }}>{r.role}</div>
              </div>
              <div className="flex w-[84px] shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-1 text-[13px] font-bold tabular-nums" style={{ color: top ? BLUE : INK }}>
                  {top && (
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                      <circle cx="7" cy="7" r="7" fill={BLUE} />
                      <path d="M4 7.2 6.1 9.2 10 5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {r.match}%
                </div>
                <div className="h-1.5 w-full rounded-full" style={{ background: "#E3EAF5" }}>
                  <div className="h-full rounded-full" style={{ width: `${r.match}%`, background: top ? BLUE : INK }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-3 text-[12px]" style={{ borderColor: "#D5DFEE", color: MUTED }}>
        <span>Renditur sipas përputhjes me AI</span>
        <span className="font-semibold" style={{ color: BLUE }}>advance.al</span>
      </div>
    </div>
  );
}

export default ApplicantsInbox;
