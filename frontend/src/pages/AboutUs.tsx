import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import RotatingContact from "@/components/RotatingContact";
import { useEffect, useState } from "react";
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
  Lightbulb
} from "lucide-react";

const AboutUs = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section 
        className="relative py-12 md:py-20 pt-20 md:pt-32 min-h-screen bg-cover bg-center bg-no-repeat overflow-hidden"
        style={{
          backgroundImage: 'url(/backgrounds/Gemini_Generated_Image_kumaagkumaagkuma.png)'
        }}
      >
        {/* Overlay for better text readability - 10% opacity (90% visible) */}
        <div className="absolute inset-0 bg-gradient-to-br from-background/10 via-background/10 to-background/10"></div>
        
        <div className="relative z-10 min-h-[600px] md:min-h-[700px] flex items-center">
          <div className="w-full h-full relative">
            {/* Mobile Layout - Stacked */}
            <div className="md:hidden container mx-auto px-4 space-y-8 text-center">
              <div className={`space-y-6 transition-all duration-1000 ease-out ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}>
                <h1 className="text-4xl font-extrabold text-foreground leading-[1.1] tracking-tight">
                  Platforma #1 e Punës
                  <br />
                  <span className="text-primary bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent">
                    në Shqipëri
                  </span>
                </h1>
                <p className="text-base text-muted-foreground leading-relaxed font-medium">
                  Ne lidhim punëkërkuesit me punëdhënësit më të mirë në Shqipëri.
                  <span className="block mt-2 text-sm opacity-90">
                    Teknologji moderne, procedeura të thjeshta, rezultate të shkëlqyera.
                  </span>
                </p>
                <div className="flex flex-col gap-3 pt-8 pb-4">
                  <Button size="lg" className="text-base px-8 py-6 shadow-2xl hover:shadow-primary/20 hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-primary hover:bg-primary/90 group font-semibold" asChild>
                    <Link to="/jobseekers" className="flex items-center justify-center">
                      <Users className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                      Gjej Punë
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="text-base px-8 py-6 shadow-xl hover:shadow-2xl border-2 backdrop-blur-md bg-background/90 hover:bg-background transition-all duration-300 hover:scale-[1.02] group font-semibold" asChild>
                    <Link to="/employers" className="flex items-center justify-center">
                      <Building className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                      Posto Punë
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Desktop Layout - Side by Side */}
            <div className="hidden md:block w-full h-full relative">
              {/* Left Side - Title (20% width, absolutely positioned) */}
              <div 
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-[20%] px-4 md:px-6 lg:px-8 transition-all duration-1000 ease-out ${
                  mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10'
                }`}
              >
                <h1 className={`text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-extrabold text-foreground leading-[1.2] tracking-tight transition-all duration-1000 delay-300 ${
                  mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
                }`}>
                  <span className="block">
                    Platforma #1 e Punës
                  </span>
                  <span className="block text-primary bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent mt-1">
                    në Shqipëri
                  </span>
                </h1>
              </div>
              
              {/* Middle - Empty space for globe (60% width) */}
              <div className="absolute left-[20%] w-[60%] h-full"></div>
              
              {/* Right Side - Description and Buttons (20% width, absolutely positioned) */}
              <div 
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-[20%] px-4 md:px-6 lg:px-8 space-y-8 transition-all duration-1000 ease-out ${
                  mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'
                }`}
              >
                <div className="space-y-6">
                  <p className={`text-base md:text-lg lg:text-xl text-muted-foreground leading-relaxed font-medium transition-all duration-1000 delay-300 ${
                    mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
                  }`}>
                    Ne lidhim punëkërkuesit me punëdhënësit më të mirë në Shqipëri.
                    <span className="block mt-3 text-sm md:text-base opacity-90">
                      Teknologji moderne, procedeura të thjeshta, rezultate të shkëlqyera.
                    </span>
                  </p>
                  <div className={`flex flex-col gap-3 md:gap-4 pt-4 transition-all duration-1000 delay-500 ${
                    mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
                  }`}>
                    <Button 
                      size="lg" 
                      className="text-base md:text-lg px-6 md:px-8 py-5 md:py-6 shadow-2xl hover:shadow-primary/20 hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-primary hover:bg-primary/90 group font-semibold" 
                      asChild
                    >
                      <Link to="/jobseekers" className="flex items-center justify-center">
                        <Users className="mr-2 md:mr-3 h-4 w-4 md:h-5 md:w-5 group-hover:scale-110 transition-transform duration-300" />
                        Gjej Punë
                      </Link>
                    </Button>
                    <Button 
                      size="lg" 
                      variant="outline" 
                      className="text-base md:text-lg px-6 md:px-8 py-5 md:py-6 shadow-xl hover:shadow-2xl border-2 backdrop-blur-md bg-background/90 hover:bg-background transition-all duration-300 hover:scale-[1.02] group font-semibold" 
                      asChild
                    >
                      <Link to="/employers" className="flex items-center justify-center">
                        <Building className="mr-2 md:mr-3 h-4 w-4 md:h-5 md:w-5 group-hover:scale-110 transition-transform duration-300" />
                        Posto Punë
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
            <div className="space-y-8">
              <div className="flex items-start space-x-4">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Briefcase className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Për Punëkërkuesit</h3>
                  <p className="text-muted-foreground">
                    Gjeni punën e ëndrrave tuaja me teknologjinë më të avancuar të kërkimit.
                    Aplikoni me një klik dhe merrni njoftimet direkt në email.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Building className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Për Punëdhënësit</h3>
                  <p className="text-muted-foreground">
                    Gjeni kandidatët më të mirë për kompaninë tuaj. Postime të thjeshta,
                    menaxhim i lehtë i aplikimeve, rezultate të garantuara.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Rritje e Karrierës</h3>
                  <p className="text-muted-foreground">
                    Platforma jonë ndihmon jo vetëm në gjetjen e punës, por edhe në
                    zhvillimin e karrierës tuaj afatgjatë.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-primary/5 to-primary/10 p-8 rounded-xl">
              <h3 className="text-2xl font-bold mb-6">Pse advance.al?</h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-lg">100% Falas për Punëkërkuesit</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-lg">Teknologji e Avancuar</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-lg">Mbështetje 24/7</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-lg">Siguri Maksimale</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-lg">Interface i Thjeshtë</span>
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
                      eksperiencën dhe aftësitë tuaja në mënyrë të natyrshme. AI-ja jonë 
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
            <Button size="lg" variant="secondary" className="text-lg px-8 py-6" asChild>
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