import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Jobseekers hero: the approved 3D walker (Higgsfield still), animated into a
 * 5 s seamless loop (MiniMax H3, start frame = end frame). Owner 2026-11-02:
 * the code-drawn walker was "insanely bad"; 3D stills approved.
 * Muted, inline, looping; the flat light background is blended away with
 * multiply; the edges where the path leaves the frame fade out.
 * Reduced motion: the still poster, no autoplay.
 *
 * Round 4 (owner: "the loop of the hero doesnt work, the video stops"):
 * reproduced in WebKit — it picked the WebM (muxed without a duration) and
 * never left 0:00. MP4 only now (H.264 plays everywhere and is the smaller
 * file), the `muted` attribute is set in the DOM (React only sets the
 * property, and Safari/iOS refuse to autoplay without the attribute), play()
 * is called explicitly, and `ended` restarts it in case `loop` is ignored.
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
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");
    const kick = () => {
      v.play().catch(() => {
        /* autoplay refused (e.g. Low Power Mode): the poster stays */
      });
    };
    const restart = () => {
      v.currentTime = 0;
      kick();
    };
    v.addEventListener("ended", restart);
    kick();
    return () => v.removeEventListener("ended", restart);
  }, [reduced]);
  const alt = "Një person ecën përgjatë një rruge që përfundon me një shigjetë përpara";
  if (reduced) {
    return <img src="/3d_assets/v2/walk-loop-poster.webp" alt={alt} className={className} style={STYLE} />;
  }
  return (
    <video
      ref={ref}
      className={className}
      style={STYLE}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      poster="/3d_assets/v2/walk-loop-poster.webp"
      aria-label={alt}
      src="/3d_assets/v2/walk-loop.mp4"
    />
  );
}

export default WalkLoop;
