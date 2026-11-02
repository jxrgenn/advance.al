import { useReducedMotion } from "motion/react";

/**
 * Jobseekers hero: the approved 3D walker (Higgsfield still), animated into a
 * 5 s seamless loop (MiniMax H3, start frame = end frame). Owner 2026-11-02:
 * the code-drawn walker was "insanely bad"; 3D stills approved.
 * Muted, inline, looping; the flat light background is blended away with
 * multiply; the edges where the path leaves the frame fade out.
 * Reduced motion: the still poster, no autoplay.
 */
// the path runs off the frame at the bottom and left: fade those two edges out
const STYLE: React.CSSProperties = {
  mixBlendMode: "multiply",
  WebkitMaskImage: "linear-gradient(to top, transparent 0, #000 16%), linear-gradient(to right, transparent 0, #000 12%)",
  WebkitMaskComposite: "source-in",
  maskImage: "linear-gradient(to top, transparent 0, #000 16%), linear-gradient(to right, transparent 0, #000 12%)",
  maskComposite: "intersect",
};

export function WalkLoop({ className }: { className?: string }) {
  const reduced = !!useReducedMotion();
  const alt = "Një person ecën përgjatë një rruge që përfundon me një shigjetë përpara";
  if (reduced) {
    return <img src="/3d_assets/v2/walk-loop-poster.webp" alt={alt} className={className} style={STYLE} />;
  }
  return (
    <video
      className={className}
      style={STYLE}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      poster="/3d_assets/v2/walk-loop-poster.webp"
      aria-label={alt}
    >
      <source src="/3d_assets/v2/walk-loop.webm" type="video/webm" />
      <source src="/3d_assets/v2/walk-loop.mp4" type="video/mp4" />
    </video>
  );
}

export default WalkLoop;
