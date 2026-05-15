# Ad Creation Playbook — Remotion Video Ads

> Drop this file into any project. Tell Claude Code: "Read AD_CREATION_PLAYBOOK.md and create TikTok/Reels ads for this app."

---

## What This Is

A complete system for creating high-converting short-form video ads (TikTok, Reels, Shorts) using Remotion — React-based programmatic video. This playbook encodes battle-tested technical patterns, animation systems, creative strategies, and an AI video generation pipeline. Everything here has been refined through 14+ ad iterations across multiple creative concepts.

---

## 1. Project Setup

### Dependencies
```json
{
  "remotion": "^4.0.447",
  "@remotion/transitions": "^4.0.447",
  "@remotion/cli": "^4.0.447",
  "react": "^19.0.0",
  "typescript": "^5.0.0"
}
```

### Composition Specs
- **Resolution**: 1080x1920 (9:16 portrait)
- **FPS**: 30
- **Duration**: 450 frames (15s) for punchy ads, 900 frames (30s) for storytelling ads
- **Registration**: All compositions go in `Root.tsx` via `<Composition>` elements

### File Structure
```
src/
  Root.tsx              # Composition registry
  TikTokAd1.tsx         # One file per ad
  TikTokAd2.tsx
  ...
public/
  *.png                 # Static images, screenshots, mascot assets
  *.mp4                 # AI-generated video clips
```

---

## 2. Proven Ad Formats

These are the creative concepts that work. Pick the ones that fit your product.

### Format A: "The Chat" (iMessage / WhatsApp Conversation)
**Best for**: Apps with user input, personalization, AI features
**Duration**: 15s (450f)
**Structure**: Chat bubbles appear with typing indicators → magic transformation → excited reaction → CTA
**Why it works**: Universally relatable format, shows the product in a native context, emotional progression from request to delight
**Key elements**: Realistic iOS status bar, typing dots animation, staggered bubble springs, confetti on reaction

### Format B: "Split Screen Before/After"
**Best for**: Any app that transforms something (editing, productivity, health, learning)
**Duration**: 15s (450f)
**Structure**: Left side (boring/old way) vs right side (your app) separated by animated golden dividing line → line pushes left revealing full magic → CTA
**Why it works**: Instant visual metaphor, creates comparative urgency, the moving line creates engagement momentum
**Key elements**: Grayscale filter on "before" side, vibrant saturation on "after" side, glowing divider with spark particles, VS badge

### Format C: "World Reveals" (Clip-Path Animations)
**Best for**: Creative apps, games, content platforms, anything with visual variety
**Duration**: 30s (900f)
**Structure**: Hook question → 4-6 different "worlds"/options revealed through animated clip-paths → typing/creation moment → montage → CTA
**Why it works**: Each reveal is visually distinct (circle expand, slide, corner burst), prevents scroll-past, showcases product variety
**Key elements**: `clipPath: circle()`, `clipPath: inset()`, progress dots, frosted glass typing card

### Format D: "Cinematic Video Montage"
**Best for**: Apps with rich visual content, lifestyle brands, premium positioning
**Duration**: 30s (900f)
**Structure**: 5-7 AI-generated video clips stitched with crossfade overlaps + 5 narrative text beats + gradient text backing + CTA
**Why it works**: Highest perceived production value, tells a complete story, text overlays ensure message clarity over any video
**Key elements**: 15-frame crossfades, gradient text backing bar, frosted glass pill for key feature callout

### Format E: "Fast Cuts / POV"
**Best for**: TikTok-native feel, younger audiences, feature demos
**Duration**: 15s (450f)
**Structure**: "POV:" impact hook → chat bubbles/requests → app demo with phone mockup → image montage → book/product showcase → CTA
**Why it works**: Matches TikTok's native fast-paced rhythm, "POV:" is proven engagement hook, each scene is a mini story
**Key elements**: Impact scale animation on hook text, realistic phone mockup, image cycling with cut-flash, fanned product cards

### Format F: "The Telescope / Portal"
**Best for**: Discovery apps, content browsing, exploration-themed products
**Duration**: 15s (450f)
**Structure**: Character looks through telescope/portal → circular viewport reveals different worlds (all CSS-generated, no images needed) → viewport expands to fill screen → CTA
**Why it works**: Zero external asset dependency, unique mechanic, curiosity-driven engagement
**Key elements**: `clipPath: circle()` viewport, brass ring with inner shadow, lens glint sweep, CSS-only worlds (gradients, clip-path polygons, border tricks)

### Format G: "App Demo with Ken Burns"
**Best for**: Established apps with good screenshots, feature walkthroughs
**Duration**: 15s (450f)
**Structure**: Emotional hook text over cinematic background → app screenshots with slow Ken Burns zoom → feature highlights → social proof → CTA
**Why it works**: Shows the actual product, Ken Burns adds cinematic feel to static images, builds trust
**Key elements**: KenBurns component (scale + translate interpolation), dark veil overlays for text readability, frosted glass UI cards

---

## 3. Technical Playbook

### 3.1 Component Architecture

**Two approaches — pick based on complexity:**

**Phase-Based (recommended for most ads):**
```tsx
export const Ad: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#020206" }}>
      {frame < 120 && <Scene1 />}
      {frame >= 105 && frame < 270 && <Scene2 />}
      {frame >= 255 && <Scene3 />}
      {/* Overlapping ranges = crossfade via opacity */}
    </AbsoluteFill>
  );
};
```
- Full control over timing and overlaps
- Manual fade interpolation feels more polished
- Better for complex choreography (5+ simultaneous animations)

**TransitionSeries (for simple sequential scenes):**
```tsx
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={75}><S1 /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 8 })} />
  <TransitionSeries.Sequence durationInFrames={85}><S2 /></TransitionSeries.Sequence>
  ...
</TransitionSeries>
```
- Easier for 6+ scenes with uniform transitions
- Less boilerplate but less control
- Frame context resets per Sequence (useCurrentFrame() is relative)

### 3.2 Animation System

**The Clamp Constant (use everywhere):**
```tsx
const cl = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
```

**Spring Configs by Use Case:**
```tsx
// Character entrances (smooth, grand settling)
spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 80 } })

// Title/text reveals (balanced, elegant)
spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 120 } })

// Button/UI elements (quick, responsive)
spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 100 } })

// Impact words like "POV:" (aggressive punch, slight bounce)
spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 200 } })

// Chat bubbles (snappy but controlled)
spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 160 } })

// Kinetic text (word-by-word, elegant cascade)
spring({ frame: frame - delay - i * 3, fps, config: { damping: 18, stiffness: 140 } })
```

**CRITICAL: Damping guidelines:**
- **Never use damping < 12** — looks cheap/bouncy
- **12-14** = punchy but controlled (buttons, cards)
- **14-16** = balanced (text, images)
- **16-20** = smooth/grand (characters, hero elements)
- **20-24** = very smooth (cinematic, slow reveals)

**Common Animation Patterns:**
```tsx
// Slide up + fade in
transform: `translateY(${interpolate(springVal, [0, 1], [30, 0])}px)`
opacity: interpolate(springVal, [0, 0.3], [0, 1], cl)

// Scale down + fade in (impact text)
transform: `scale(${interpolate(springVal, [0, 1], [1.5, 1])})`
opacity: interpolate(springVal, [0, 0.3], [0, 1], cl)

// Pop in from small (cards, book covers)
transform: `scale(${interpolate(springVal, [0, 1], [0.2, 1])})`

// Fade in/out with hold
opacity: interpolate(frame, [startFade, startHold, endHold, endFade], [0, 1, 1, 0], cl)
```

**Fade Timing Rules:**
- **Minimum 10 frames** for any fade-in/fade-out (0.33s at 30fps)
- **12-15 frames** is the sweet spot for most transitions
- **Never use 2-4 frame fades** — looks like a glitch
- Scene crossfade overlaps: 15 frames standard

### 3.3 Color System

```tsx
// Warm premium palette (works for most products)
const GOLD = "#D4A574";        // Primary accent — buttons, emphasis, borders
const GOLD_LIGHT = "#E5B567";  // Highlights, glow effects, particles
const CREAM = "#F0E6D6";       // Body text on dark backgrounds
const BG_DARK = "#020206";     // Near-black background

// Adapt these to your brand but keep the warm/cool contrast
// Your brand color replaces GOLD
// Keep CREAM for text readability
// Keep dark backgrounds for contrast
```

**Gradient text (for accent words):**
```tsx
background: `linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_LIGHT})`,
WebkitBackgroundClip: "text",
WebkitTextFillColor: "transparent",
```

### 3.4 Typography

```tsx
// Hero text (app name, big statements)
fontSize: 100-112, fontWeight: "900", fontFamily: "'Georgia', serif"

// Headlines
fontSize: 64-80, fontWeight: "700-900", fontFamily: "'Georgia', serif"

// Subheadlines
fontSize: 52-64, fontWeight: "300-400", fontFamily: "'Georgia', serif", fontStyle: "italic"

// Body / UI text
fontSize: 38-48, fontWeight: "400-600", fontFamily: "system-ui, sans-serif"

// Impact words (POV:, numbers)
fontSize: 80-96, fontWeight: "900", letterSpacing: 4-6
```

**Text shadows (use consistently):**
```tsx
// Standard (works on most backgrounds)
textShadow: "0 3px 30px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.5)"

// Gold glow (for accent text)
textShadow: `0 0 50px ${GOLD}50, 0 4px 30px rgba(0,0,0,0.9)`

// Heavy (for text over busy video/images)
textShadow: "0 2px 32px rgba(0,0,0,0.8), 0 1px 6px rgba(0,0,0,0.95)"
```

**Text backing gradient (for text over video/images):**
```tsx
function TextBacking({ opacity }: { opacity: number }) {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: 600,
      background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.35) 50%, transparent 100%)",
      opacity, pointerEvents: "none",
    }} />
  );
}
```

### 3.5 Particle System

```tsx
function GoldenDust({ count = 18, color = "#E5B567" }) {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const speed = 0.25 + (i % 5) * 0.12;
        const life = (frame * speed + i * 47) % 220;
        const size = 2 + (i % 4) * 1.5;
        return (
          <div key={i} style={{
            position: "absolute",
            left: 40 + (i * 83) % 1000 + Math.sin(frame * 0.012 + i * 2.3) * 35,
            top: 1920 - life * 6,
            width: size, height: size, borderRadius: "50%",
            backgroundColor: color,
            opacity: interpolate(life, [0, 25, 170, 220], [0, 0.3, 0.15, 0], cl),
            boxShadow: `0 0 ${size * 4}px ${color}40`,
            pointerEvents: "none",
          }} />
        );
      })}
    </>
  );
}
```
- Lifecycle loop (220 frames = 7.3s) prevents repetition
- Wavy horizontal motion via `Math.sin` offset
- Rising motion via `1920 - life * 6`
- Glow via `boxShadow` is 80% of the "magic" effect

### 3.6 Reusable Components

**KenBurns (cinematic zoom on static images):**
```tsx
function KenBurns({ src, s0 = 1, s1 = 1.08, px = 0, total = 100 }: {
  src: string; s0?: number; s1?: number; px?: number; total?: number;
}) {
  const frame = useCurrentFrame();
  const sc = interpolate(frame, [0, total], [s0, s1], { extrapolateRight: "clamp" });
  const tx = interpolate(frame, [0, total], [0, px], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{
        width: "100%", height: "100%", objectFit: "cover",
        transform: `scale(${sc}) translateX(${tx}px)`,
        transformOrigin: "center center",
      }} />
    </div>
  );
}
```
- `s0`/`s1`: start/end scale (1.0 → 1.08 is subtle, cinematic)
- `px`: horizontal pan (±20px is subtle)
- IMPORTANT: `total` MUST match the scene's actual frame count

**Frosted Glass Card:**
```tsx
<div style={{
  backgroundColor: "rgba(255,255,255,0.08)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 24,
  padding: "20px 28px",
  border: "1px solid rgba(255,255,255,0.12)",
}}>
```

**Vignette Overlay:**
```tsx
<div style={{
  position: "absolute", inset: 0,
  background: "radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,0,0.35) 100%)",
  pointerEvents: "none",
}} />
```

### 3.7 CTA Section (Standardized)

Every ad ends with this cascade. Timing is relative to CTA phase start:

```
+0f    Background fades in (dark radial gradient + 35 twinkling stars)
+8f    Mascot/logo drops in (damping 16, stiffness 80, Y offset 80→0)
+22f   App title scales in (damping 14, stiffness 120, scale 1.5→1)
+40f   Subtitle fades in (italic, 40px, reduced opacity)
+50f   Star rating fades in (★★★★★, gold, letterSpacing 6)
+60f   Download button springs in (damping 12, stiffness 100)
         - Pulsing scale: 1 + sin(frame * 0.1) * 0.025
         - Animated glow: 44 + sin(frame * 0.12) * 28
         - Shimmer stripe: left = interpolate(frame % 70, [0,70], [-120, 540])
```

**CTA duration**: Minimum 90 frames (3s) for the full cascade to land.

### 3.8 Video Stitching (AI-Generated Clips)

For stitching AI-generated video clips into a Remotion ad:

```tsx
const CLIPS = [
  { from: 0,   dur: 105, src: "scene_1.mp4" },
  { from: 90,  dur: 60,  src: "transition_1.mp4" },  // 15f overlap
  { from: 135, dur: 135, src: "scene_2.mp4" },        // 15f overlap
  // ...
];

{CLIPS.map((clip, i) => {
  if (frame < clip.from || frame >= clip.from + clip.dur) return null;
  const fadeIn = i === 0
    ? interpolate(frame, [0, 12], [0, 1], cl)
    : interpolate(frame, [clip.from, clip.from + 15], [0, 1], cl);
  const fadeOut = interpolate(frame, [clip.from + clip.dur - 15, clip.from + clip.dur], [1, 0], cl);
  return (
    <AbsoluteFill key={i} style={{ opacity: Math.min(fadeIn, fadeOut), zIndex: i }}>
      <Sequence from={clip.from} durationInFrames={clip.dur}>
        <Video src={staticFile(clip.src)} volume={0}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Sequence>
    </AbsoluteFill>
  );
})}
```

**Square video (960x960) in portrait frame (1080x1920):**
- `objectFit: "cover"` zooms in 2x, crops sides — key content must be centered
- Mixed fps clips (24fps in 30fps composition) play at real-time speed automatically

---

## 4. AI Video Generation Pipeline

When you need AI-generated video clips for cinematic ads:

### Step 1: Generate Start Frame Image
Prompt for the image generation model describing the FIRST frame of the scene.
Include character reference if needed for consistency.

### Step 2: Generate End Frame Image
Prompt for the LAST frame of the scene.
Same character reference, different pose/location.

### Step 3: Generate Scene Video
Prompt describes ONLY motion and camera movement — NOT what's in the image (the AI already has the start/end frames).

**Example scene video prompt:**
> The camera slowly zooms in as the character turns to look toward the glowing light below. Gentle floating motion, dreamy atmosphere. Smooth continuous camera push-in.

**BAD prompt** (re-describes visuals):
> ~~A white bunny with a nightcap sitting on a cloud in a starry sky turns to look at a golden beam of light coming from a village below~~

### Step 4: Generate Transition Videos
For clips between scenes, provide end frame of scene N as start frame and start frame of scene N+1 as end frame.

**Example transition prompt:**
> The scene transforms through swirling golden light, the bedroom dissolving into open sky as the camera pulls back to reveal a new landscape. Smooth morphing transition.

### Clip Specs
- **Resolution**: 960x960 (square, will be cropped to portrait via objectFit: cover)
- **Duration**: 3-8 seconds per scene, 2-3 seconds per transition
- **FPS**: 24fps is standard from most generators

---

## 5. Creative Guidelines

### What Makes Ads Convert

1. **Hook in first 2 seconds** — POV:, a question, a dramatic visual, a relatable scenario
2. **Show the transformation** — Before state → After state, boring → magical
3. **One clear message per scene** — Don't cram. Each scene says ONE thing.
4. **Text overlays sell, video entertains** — Beautiful video alone doesn't convert. You need text that says what the product DOES.
5. **CTA must feel earned** — The cascade builds anticipation. Don't rush it.
6. **Sound matters** — Use trending TikTok sounds for organic, Commercial Music Library for paid ads

### What to Avoid

- **Damping below 12** on any spring — looks cheap and bouncy
- **Fades under 10 frames** — looks like a glitch, not a transition
- **Text without backing over video** — unreadable on bright frames
- **Too many simultaneous moving elements** — 3 animated things max per frame
- **Neon/rainbow colors** — looks amateur. Stick to warm premium palette
- **Aggressive zoom (>1.15x)** — ken burns should be subtle (1.05-1.1x)
- **Re-describing images in video prompts** — the AI has the frames, just describe MOTION
- **Using pre-generated images as main content** — use them as supplementary elements only (mascots, icons, accents). Generate scene-specific visuals.
- **PNG slideshows** — NEVER use a series of static images as the main ad content. If you need character showcase, use AI-generated video or rich CSS animation.

### Modern Marketing Elements to Include

- **App demos**: Screen recordings or realistic phone mockups showing actual UI
- **Professional image generations**: AI-generated scenes with text/typography baked in
- **3D elements**: Floating UI cards, perspective-tilted phones, depth-of-field effects
- **Glassmorphism**: Frosted glass cards, blurred backgrounds, subtle transparency
- **Kinetic typography**: Words that animate in individually with staggered springs
- **Clip-path reveals**: Circular, diagonal, or custom-shape reveals for scene transitions
- **Parallax layers**: Background moves slower than foreground for depth
- **Particle systems**: Golden dust, fireflies, confetti — always with glow

### Platform-Specific Notes

- **TikTok**: 9:16 mandatory, trending sounds boost reach, fast-paced (15s preferred), "POV:" hooks work
- **Instagram Reels**: Same format, slightly more polished/aesthetic feel expected
- **YouTube Shorts**: Same format, can be slightly longer, text clarity matters more (smaller screens)
- **Paid ads**: Use platform's Commercial Music Library, A/B test 3-5 different ad concepts

---

## 6. Workflow

1. **Understand the product** — What does the app do? Who is it for? What problem does it solve?
2. **Pick 3-5 ad formats** from Section 2 that fit the product
3. **Gather assets** — App screenshots, mascot/logo PNGs, AI-generated scene images
4. **Generate AI videos** if using Format D (follow Section 4 pipeline)
5. **Build each ad** — One .tsx file per ad, register in Root.tsx
6. **Preview in Remotion Studio** — `npx remotion studio`
7. **Polish pass** — Check spring damping (≥12), fade timing (≥10f), text readability
8. **Render** — `npx remotion render AdName out/AdName.mp4`
9. **Add sound** — Trending sound (organic) or Commercial Music Library (paid)
10. **A/B test** — Run 3-5 ads, kill underperformers, scale winners

---

## 7. Quality Checklist

Before shipping any ad:

- [ ] All springs have damping ≥ 12
- [ ] All fade-in/fade-out durations ≥ 10 frames
- [ ] Text over images/video has gradient backing or heavy text shadow
- [ ] CTA section has: mascot/logo, app name, subtitle, stars, glowing download button
- [ ] CTA cascade takes at least 90 frames (3s)
- [ ] No text overflow beyond 1080px width (check with padding)
- [ ] App name is consistent across all ads
- [ ] All referenced assets exist in public/
- [ ] `npx remotion compositions` builds without errors
- [ ] Total frame count matches Root.tsx composition duration
- [ ] Video clips have `volume={0}`
- [ ] No elements positioned off-screen or overlapping text
- [ ] Particle count is reasonable (12-40, not 100+)
- [ ] KenBurns `total` parameter matches actual scene duration

---

## Quick Start

Tell Claude Code:

> "Read AD_CREATION_PLAYBOOK.md. This app is [describe your app in 1-2 sentences]. Create 5 TikTok ads using Remotion: one iMessage chat format, one split screen before/after, one fast-cuts POV, one cinematic with Ken Burns, and one clip-path world reveal. Use the standard color system adapted to our brand color [your hex]. All ads should be 1080x1920 at 30fps."

That's it. This document contains everything needed to recreate the entire ad creation system from scratch.
