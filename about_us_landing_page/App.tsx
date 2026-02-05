import React, { useState, useEffect, useRef } from 'react';
import Scene from './components/Scene';
import { generateVideoAsset, ensureApiKeySelected } from './services/geminiService';
import { Search, Briefcase, Sparkles, ChevronDown, Download, Video as VideoIcon, Loader2, PlayCircle } from 'lucide-react';

const App: React.FC = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  // New state to manage the positioning mode manually instead of relying on CSS sticky
  const [positionMode, setPositionMode] = useState<'absolute-top' | 'fixed' | 'absolute-bottom'>('absolute-top');
  
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [promptAction, setPromptAction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const trackHeight = rect.height;
      const scrollableDistance = trackHeight - viewportHeight;
      
      // 1. Calculate Progress
      // We clamp the progress between 0 and 1
      const rawProgress = -rect.top / scrollableDistance;
      const progress = Math.min(Math.max(rawProgress, 0), 1);
      setScrollProgress(progress);

      // 2. Manual Position Locking Logic (Replaces CSS Sticky)
      // This ensures the element stays on screen even if parent has overflow:hidden
      
      // Case A: We haven't reached the section yet (or just at top)
      if (rect.top > 0) {
        setPositionMode('absolute-top');
      } 
      // Case B: We scrolled past the entire section
      else if (rect.bottom <= viewportHeight) {
        setPositionMode('absolute-bottom');
      } 
      // Case C: We are actively scrolling inside the section
      else {
        setPositionMode('fixed');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    
    // Initial calculation
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const handleGenerate = async (preset?: string) => {
    const actionToUse = preset || promptAction;
    if (!actionToUse || isGenerating) return;

    const hasKey = await ensureApiKeySelected();
    if (!hasKey) {
      alert("Please select a paid API key to use the Video Generation feature.");
      return;
    }

    setIsGenerating(true);
    setGeneratedVideo(null);

    const assetUrl = await generateVideoAsset(actionToUse);
    
    if (assetUrl) {
      setGeneratedVideo(assetUrl);
    }
    setIsGenerating(false);
  };

  // Helper to get styles based on current mode
  const getPositionStyles = (): React.CSSProperties => {
    switch (positionMode) {
      case 'fixed':
        return { position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 10 };
      case 'absolute-bottom':
        return { position: 'absolute', bottom: 0, left: 0, width: '100%', height: '100vh', zIndex: 10 };
      case 'absolute-top':
      default:
        return { position: 'absolute', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 10 };
    }
  };

  return (
    <div className="relative bg-slate-50 selection:bg-blue-100 selection:text-blue-900 font-sans">
      
      {/* 
        SCROLL TRACK CONTAINER
        - This provides the "height" for the scroll interaction (300vh).
        - It acts as the reference point for our manual calculations.
      */}
      <div ref={containerRef} className="relative h-[300vh] w-full bg-slate-50">
        
        {/* 
          LOCKED VIEWPORT 
          - Instead of className="sticky...", we use inline styles driven by JS.
          - This physically forces the element to stay on screen (fixed) or stay in container (absolute).
        */}
        <div 
          className="overflow-hidden"
          style={getPositionStyles()}
        >
          
          <Scene scrollProgress={scrollProgress} />

          <div className="relative z-10 flex flex-col h-full justify-between pointer-events-none">
            <div className="h-24"></div>
            <main className="flex-grow flex items-center px-6 lg:px-8 max-w-7xl mx-auto w-full">
              <div 
                className="max-w-xl transition-opacity duration-300 pointer-events-auto"
                style={{ opacity: 1 - scrollProgress * 1.5, transform: `translateY(-${scrollProgress * 50}px)` }}
              >
                <h1 className="text-5xl md:text-7xl font-bold text-slate-900 tracking-tight leading-[1.1] mb-6">
                  Platforma #1 e <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                    Punës në Shqipëri
                  </span>
                </h1>
                <p className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed max-w-lg">
                  Ne lidhim punëkërkuesit me punëdhënësit më të mirë në Shqipëri.
                  Ngjit shkallët e karrierës tuaj me ne.
                </p>
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <button className="group relative px-8 py-4 bg-blue-600 text-white rounded-xl text-base font-semibold shadow-xl shadow-blue-600/20 hover:shadow-2xl hover:shadow-blue-600/30 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
                    <div className="absolute inset-0 bg-white/20 group-hover:translate-x-full transition-transform duration-500 -skew-x-12 -translate-x-full origin-left"></div>
                    <span className="flex items-center gap-2">
                      <Search className="w-5 h-5" />
                      Gjej punë
                    </span>
                  </button>
                  <button className="px-8 py-4 bg-white border border-slate-200 text-slate-700 rounded-xl text-base font-semibold hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-all duration-300 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-slate-400" />
                    Posto punë
                  </button>
                </div>
              </div>
            </main>

            <div 
              className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-400 transition-opacity duration-500 pointer-events-auto"
              style={{ opacity: scrollProgress > 0.1 ? 0 : 1 }}
            >
               <span className="text-xs font-medium uppercase tracking-widest opacity-50">Scroll to climb</span>
               <ChevronDown className="w-6 h-6 animate-bounce" />
            </div>
          </div>
        </div>
      </div>

      {/* ASSET GENERATOR SECTION */}
      <section className="relative z-20 bg-white py-24 px-6 border-t border-slate-200 min-h-screen flex items-center">
        <div className="max-w-6xl mx-auto w-full">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Studio e Aseteve të Lëvizshme</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Generate high-quality animated 3D video assets. Perfect for web backgrounds. 
              The character style is locked (Orange Hoodie), just describe the action.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 shadow-sm">
              <div className="mb-8">
                <label className="block text-sm font-semibold text-slate-900 mb-3">
                  Describe the Action
                </label>
                <div className="flex gap-2 mb-4">
                  <input 
                    type="text" 
                    value={promptAction}
                    onChange={(e) => setPromptAction(e.target.value)}
                    placeholder="e.g. typing on a laptop, climbing a ladder..."
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <button 
                    onClick={() => handleGenerate()}
                    disabled={isGenerating || !promptAction}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isGenerating ? <Loader2 className="animate-spin w-5 h-5"/> : <Sparkles className="w-5 h-5" />}
                    Generate
                  </button>
                </div>
                
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quick Presets</p>
                  <div className="flex flex-wrap gap-2">
                    {['Typing on a laptop', 'Climbing a mountain', 'Waving hello', 'Thinking hard', 'Running fast'].map((action) => (
                      <button
                        key={action}
                        onClick={() => {
                          setPromptAction(action);
                          handleGenerate(action);
                        }}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50/50 rounded-xl p-6 border border-blue-100">
                <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <VideoIcon className="w-4 h-4" /> Animated Asset Specs
                </h4>
                <p className="text-sm text-blue-800/80">
                  Generates a seamless video loop instead of a static image.
                </p>
                <ul className="text-sm text-blue-800/70 mt-2 list-disc list-inside space-y-1">
                  <li>Format: MP4 Video (Veo Model)</li>
                  <li>Style: 3D Cartoon / Claymorphism</li>
                  <li>Character: Orange Hoodie Professional</li>
                  <li>Background: Clean White Studio</li>
                </ul>
              </div>
            </div>

            <div className="relative aspect-video bg-slate-100 rounded-3xl border border-slate-200 flex items-center justify-center overflow-hidden shadow-inner group">
              {generatedVideo ? (
                <>
                  <video 
                    src={generatedVideo} 
                    autoPlay 
                    loop 
                    muted 
                    className="w-full h-full object-cover" 
                  />
                  <a 
                    href={generatedVideo} 
                    download={`3d-asset-video-${Date.now()}.mp4`}
                    className="absolute bottom-6 right-6 bg-white text-slate-900 px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 duration-300"
                  >
                    <Download className="w-5 h-5" /> Download MP4
                  </a>
                </>
              ) : (
                <div className="text-center text-slate-400">
                  {isGenerating ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="animate-pulse">Rendering 3D Video... (this takes ~30s)</p>
                    </div>
                  ) : (
                    <>
                      <div className="w-20 h-20 bg-slate-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <PlayCircle className="w-10 h-10 opacity-50" />
                      </div>
                      <p>Your generated animated asset will appear here</p>
                    </>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

    </div>
  );
};

export default App;