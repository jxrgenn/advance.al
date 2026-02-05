import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import RotatingContact from "@/components/RotatingContact";
import AdvanceLanding from "@/components/about_us_actual_landing";
import { useEffect, useState, useRef } from "react";
import {
  Users,
  Building,
  Briefcase,
  CheckCircle,
  Star,
  TrendingUp,
  Shield,
  Clock,
  MapPin,
  Mail,
  Phone,
  Zap,
  UserCheck,
  Bell,
  Lightbulb,
  Search,
  ChevronDown
} from "lucide-react";

const AboutUs = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [positionMode, setPositionMode] = useState<'absolute-top' | 'fixed' | 'absolute-bottom'>('absolute-top');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const trackHeight = rect.height;
      const scrollableDistance = trackHeight - viewportHeight;

      // Calculate Progress
      const rawProgress = -rect.top / scrollableDistance;
      const progress = Math.min(Math.max(rawProgress, 0), 1);
      setScrollProgress(progress);

      // Manual Position Locking Logic
      // Case A: We haven't reached the section yet
      if (rect.top > 0) {
        setPositionMode('absolute-top');
      }
      // Case B: We scrolled past the entire section
      else if (rect.bottom <= viewportHeight) {
        setPositionMode('absolute-bottom');
      }
      // Case C: We are actively scrolling inside the section - LOCK IT
      else {
        setPositionMode('fixed');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

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
      <Navigation />

      {/* Landing Section */}
      <div className="relative w-full bg-slate-50">
        <AdvanceLanding />
      </div>

      {/* Statistics Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Rezultatet Flasin Vetë
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            <Card className="text-center p-6 bg-background border-2 hover:border-primary/50 transition-colors">
              <CardContent className="space-y-3 p-0">
                <div className="text-3xl md:text-4xl font-bold text-primary">500+</div>
                <div className="text-sm md:text-base text-muted-foreground">Punë të Publikuara</div>
              </CardContent>
            </Card>
            <Card className="text-center p-6 bg-background border-2 hover:border-primary/50 transition-colors">
              <CardContent className="space-y-3 p-0">
                <div className="text-3xl md:text-4xl font-bold text-primary">1200+</div>
                <div className="text-sm md:text-base text-muted-foreground">Aplikime të Suksesshme</div>
              </CardContent>
            </Card>
            <Card className="text-center p-6 bg-background border-2 hover:border-primary/50 transition-colors">
              <CardContent className="space-y-3 p-0">
                <div className="text-3xl md:text-4xl font-bold text-primary">150+</div>
                <div className="text-sm md:text-base text-muted-foreground">Kompani Partnere</div>
              </CardContent>
            </Card>
            <Card className="text-center p-6 bg-background border-2 hover:border-primary/50 transition-colors">
              <CardContent className="space-y-3 p-0">
                <div className="text-3xl md:text-4xl font-bold text-primary">95%</div>
                <div className="text-sm md:text-base text-muted-foreground">Kënaqësi e Përdoruesve</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Çfarë Bëjmë Ne?
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              advance.al është platforma më moderne dhe më e lehtë për t'u përdorur në tregun shqiptar të punës.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left side - Image */}
            <div className="flex justify-center items-center">
              <img
                src="/3d_assets/hired1.png"
                alt="Job matching success - Connecting job seekers with employers"
                className="w-full max-w-[400px] object-contain"
                loading="eager"
              />
            </div>

            {/* Right side - Pse advance.al? */}
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-8 border border-primary/20">
              <h3 className="text-2xl font-bold mb-6 text-foreground">Pse advance.al?</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Platforma #1 në Shqipëri për punësim</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Mijëra punë të reja çdo javë</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Kompani të verifikuara dhe të besueshme</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Aplikim i shpejtë dhe i thjeshtë</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">Njoftime automatike për punë të reja</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">100% falas për punëkërkuesit</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Different Ways to Use Platform */}
      <section className="py-16 bg-gradient-to-br from-blue-50/50 to-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Tre Mënyra për të Përdorur advance.al
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              Zgjidhni mënyrën që ju përshtatet më së miri. Fleksibël, i thjeshtë, dhe gjithmonë efektiv.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {/* Full Account */}
            <Link to="/login?tab=register&type=jobseeker">
            <Card className="p-6 bg-background border-2 hover:border-primary/60 transition-all duration-300 hover:shadow-lg cursor-pointer">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <UserCheck className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-center">Profil i Plotë</h3>
                <p className="text-muted-foreground text-center text-sm">
                  Krijoni një llogari të plotë dhe aplikoni për punë me vetëm një klik.
                </p>
                <div className="space-y-3 pt-4">
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Aplikim me 1 klik për të gjitha punët</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Menaxhim i aplikimeve tuaja</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Njoftime për përputhje të reja</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Gjenero CV me AI automatikisht</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>

            {/* Flexible Application */}
            <Link to="/login?tab=register&type=jobseeker">
            <Card className="p-6 bg-background border-2 hover:border-primary/60 transition-all duration-300 hover:shadow-lg cursor-pointer">
              <CardContent className="space-y-4 p-0">
                <div className="bg-orange-500/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Zap className="h-8 w-8 text-orange-600" />
                </div>
                <h3 className="text-xl font-semibold text-center">Aplikim Fleksibël</h3>
                <p className="text-muted-foreground text-center text-sm">
                  Krijoni llogari por plotësoni të dhënat për çdo aplikim veç e veç.
                </p>
                <div className="space-y-3 pt-4">
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Kontroll i plotë mbi çdo aplikim</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Personalizoni mesazhin për çdo punë</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Zgjidhni çfarë informacioni të ndani</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Ideal për aplikime të kujdesshme</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>

            {/* Quick Profile */}
            <Link to="/jobseekers">
            <Card className="p-6 bg-background border-2 hover:border-primary/60 transition-all duration-300 hover:shadow-lg cursor-pointer">
              <CardContent className="space-y-4 p-0">
                <div className="bg-green-500/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Bell className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-center">Profil i Shpejtë</h3>
                <p className="text-muted-foreground text-center text-sm">
                  Vetëm jepni të dhënat bazë dhe merrni njoftime për punë të reja.
                </p>
                <div className="space-y-3 pt-4">
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Pa nevojë për regjistrim të plotë</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Email njoftime për punë të reja</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Punëdhënësit mund t'ju kontaktojnë</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Më e shpejta - vetëm 2 minuta</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>
          </div>

          {/* AI CV Generation CTA */}
          <div className="mt-12 max-w-5xl mx-auto">
            <Card className="overflow-hidden border-2 border-primary/20 hover:border-primary/40 transition-all duration-300">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row items-center">
                  {/* Left side - Icon & Info */}
                  <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-8 md:w-2/5 flex flex-col items-center justify-center text-center">
                    <div className="bg-white p-4 rounded-2xl shadow-sm mb-4">
                      <Lightbulb className="h-12 w-12 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Gjenero CV me AI</h3>
                    <p className="text-sm text-muted-foreground">
                      Shkrim i lirë • Çdo gjuhë • Automatik
                    </p>
                  </div>
                  
                  {/* Right side - Description & CTA */}
                  <div className="p-8 md:w-3/5">
                    <p className="text-muted-foreground mb-6 leading-relaxed">
                      Krijoni një CV profesionale në sekonda duke shkruar thjesht për veten, 
                      eksperiencën dhe aftësitë tuaja në mënyrë të natyrshme. IA jonë 
                      analizon tekstin dhe krijon një CV të formatuar dhe të optimizuar automatikisht.
                    </p>
                    <Button size="lg" className="w-full md:w-auto" asChild>
                      <Link to="/jobseekers#ai-cv-section">
                        <Lightbulb className="mr-2 h-5 w-5" />
                        Provo Gjenerimin e CV-së
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Choose advance.al Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Pse të Zgjidhni advance.al?
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-6 text-center bg-background border-2 hover:border-primary/50 transition-all duration-300">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Siguri e Plotë</h3>
                <p className="text-muted-foreground">
                  Të dhënat tuaja janë të sigurta me teknologjinë më të fundit të enkriptimit.
                  Zero spam, zero probleme.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center bg-background border-2 hover:border-primary/50 transition-all duration-300">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Clock className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Shpejtësi Maksimale</h3>
                <p className="text-muted-foreground">
                  Platforma më e shpejtë në Shqipëri. Aplikoni për punë në më pak se 30 sekonda.
                  Rezultate të menjëhershme.
                </p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center bg-background border-2 hover:border-primary/50 transition-all duration-300">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                  <Star className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Cilësi e Lartë</h3>
                <p className="text-muted-foreground">
                  Vetëm punë dhe kandidatë të cilësisë së lartë. Të gjitha kompanitë
                  janë të verifikuara dhe të besueshme.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Albanian Market Focus */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              E Krijuar Specifikisht për Shqipërinë
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              Ne e dimë tregun shqiptar më mirë se kushdo. Platforma jonë është e përshtatur
              100% për nevojat dhe kulturën e biznesit shqiptar.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <MapPin className="h-6 w-6 text-primary" />
                  <div>
                    <h4 className="font-semibold">Të Gjitha Qytetet Shqiptare</h4>
                    <p className="text-sm text-muted-foreground">
                      Nga Shkodra në Sarandë, kemi punë në çdo qytet të Shqipërisë
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <Users className="h-6 w-6 text-primary" />
                  <div>
                    <h4 className="font-semibold">Komuniteti Shqiptar</h4>
                    <p className="text-sm text-muted-foreground">
                      Krijoni lidhje me profesionistë të tjerë shqiptarë
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <Building className="h-6 w-6 text-primary" />
                  <div>
                    <h4 className="font-semibold">Biznese Lokale</h4>
                    <p className="text-sm text-muted-foreground">
                      Mbështesim rritjen e bizneseve shqiptare
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-500/10 via-red-600/5 to-background p-8 rounded-xl border-2">
              <div className="text-center space-y-4">
                <div className="text-6xl">🇦🇱</div>
                <h3 className="text-2xl font-bold">Made in Albania</h3>
                <p className="text-muted-foreground">
                  Prej shqiptarësh, për shqiptarë. Krenohemi që jemi të parët që
                  sjellin teknologjinë moderne në tregun e punës në Shqipëri.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Information - New Component */}
      <RotatingContact />

      {/* Call to Action */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Gati të Filloni?
          </h2>
          <p className="text-lg md:text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Bashkohuni me mijëra punëkërkues dhe qindra kompani që kanë zgjedhur advance.al
            si platformën e tyre të besuar për punën.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="text-lg px-8 py-[26px]" asChild>
              <Link to="/jobseekers">
                <Users className="mr-3 h-5 w-5" />
                Regjistrohuni si Punëkërkues
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2 border-white text-white bg-transparent hover:bg-white hover:text-primary transition-colors" asChild>
              <Link to="/employers">
                <Building className="mr-3 h-5 w-5" />
                Regjistrohuni si Punëdhënës
              </Link>
            </Button>
          </div>
        </div>
      </section>
      
      <Footer />
    </div>
  );
};

export default AboutUs;