import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
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
  Phone
} from "lucide-react";

const AboutUs = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-primary/5 to-background py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-6">
            <Badge variant="secondary" className="text-lg px-6 py-2 mb-4">
              advance.al
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
              Platforma #1 e Punës
              <br />
              <span className="text-primary">në Shqipëri</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Ne lidhim punëkërkuesit me punëdhënësit më të mirë në Shqipëri.
              Teknologji moderne, procedeura të thjeshta, rezultate të shkëlqyera.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button size="lg" className="text-lg px-8 py-6" asChild>
                <Link to="/jobseekers">
                  <Users className="mr-3 h-5 w-5" />
                  Gjej Punë
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6" asChild>
                <Link to="/employers">
                  <Building className="mr-3 h-5 w-5" />
                  Posto Punë
                </Link>
              </Button>
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

      {/* Contact Information */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Na Kontaktoni
            </h2>
            <p className="text-lg text-muted-foreground">
              Jemi këtu për t'ju ndihmuar në çdo hap të udhëtimit tuaj profesional
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <Card className="p-6 text-center bg-background">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-3 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">Email</h3>
                <p className="text-muted-foreground">info@advance.al</p>
                <p className="text-muted-foreground">support@advance.al</p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center bg-background">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-3 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                  <Phone className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">Telefon</h3>
                <p className="text-muted-foreground">+355 69 123 4567</p>
                <p className="text-muted-foreground">+355 67 890 1234</p>
              </CardContent>
            </Card>

            <Card className="p-6 text-center bg-background">
              <CardContent className="space-y-4 p-0">
                <div className="bg-primary/10 p-3 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">Adresa</h3>
                <p className="text-muted-foreground">Tiranë, Shqipëri</p>
                <p className="text-muted-foreground">Rruga e Punës, Nr. 1</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

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
    </div>
  );
};

export default AboutUs;