import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Shield, Database, Cookie, UserCheck, Mail, Eye } from "lucide-react";

const Privacy = () => {
  return (
    <div className="relative bg-slate-50 selection:bg-blue-100 selection:text-blue-900 font-sans min-h-screen flex flex-col">
      <Navigation />

      {/* Header */}
      <section className="pt-28 pb-12 bg-gradient-to-br from-primary/5 to-primary/10">
        <div className="container mx-auto px-4 text-center">
          <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-6">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Politika e Privatësisë
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Mësoni se si advance.al mbledh, përdor dhe mbron të dhënat tuaja personale.
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Përditësuar së fundmi: Mars 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 flex-1">
        <div className="container mx-auto px-4 max-w-4xl space-y-8">

          {/* Introduction */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Eye className="h-5 w-5 text-primary flex-shrink-0" />
                Hyrje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al ("ne", "platforma") është një platformë punësimi në internet që operon në Republikën e Shqipërisë.
                Kjo politikë privatësie shpjegon se si ne mbledhim, përdorim, ruajmë dhe mbrojmë informacionin tuaj personal
                kur përdorni shërbimet tona.
              </p>
              <p>
                Duke përdorur advance.al, ju pranoni praktikat e përshkruara në këtë politikë. Nëse nuk jeni dakord me këtë
                politikë, ju lutemi mos përdorni platformën tonë.
              </p>
            </CardContent>
          </Card>

          {/* Data Collection */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Database className="h-5 w-5 text-primary flex-shrink-0" />
                Të Dhënat që Mbledhim
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Ne mbledhim llojet e mëposhtme të informacionit:</p>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Informacioni i Llogarisë</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Emri dhe mbiemri</li>
                  <li>Adresa e emailit</li>
                  <li>Numri i telefonit (opsional)</li>
                  <li>Fjalëkalimi (i enkriptuar)</li>
                  <li>Roli në platformë (punëkërkues ose punëdhënës)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Informacioni i Profilit të Punëkërkuesit</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>CV dhe dokumentet e ngarkuara</li>
                  <li>Eksperienca e punës dhe arsimimi</li>
                  <li>Aftësitë profesionale</li>
                  <li>Preferencat e punës (vendndodhja, paga, lloji)</li>
                  <li>Foto e profilit (opsionale)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Informacioni i Punëdhënësit</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Emri i kompanisë dhe përshkrimi</li>
                  <li>NIPT / numri i regjistrimit të biznesit</li>
                  <li>Adresa dhe vendndodhja</li>
                  <li>Njoftimet e punës së publikuara</li>
                  <li>Logoja e kompanisë</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Të Dhëna Automatike</h4>
                <p className="text-sm ml-2">
                  Serveri ynë regjistron informacion bazë të kërkesave (si adresa IP dhe lloji i shfletuesit) në mënyrë
                  të përkohshme për qëllime diagnostikuese, por nuk i ruajmë këto të dhëna në mënyrë të strukturuar
                  dhe nuk krijojmë profile përdoruesish bazuar në to.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Usage */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <UserCheck className="h-5 w-5 text-primary flex-shrink-0" />
                Si i Përdorim të Dhënat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Informacioni juaj përdoret për qëllimet e mëposhtme:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="font-medium text-foreground">Ofrimi i shërbimeve:</span> Mundësimi i krijimit të llogarisë,
                  publikimit të punëve, aplikimit për punë dhe komunikimit ndërmjet punëkërkuesve dhe punëdhënësve.
                </li>
                <li>
                  <span className="font-medium text-foreground">Përputhja e punëve:</span> Përdorimi i algoritmeve për të
                  sugjeruar punë relevante bazuar në profilin dhe preferencat tuaja.
                </li>
                <li>
                  <span className="font-medium text-foreground">Gjenerimi i CV me AI:</span> Kur përdorni funksionin e gjenerimit
                  të CV-së, të dhënat tuaja përpunohen nga inteligjenca artificiale për të krijuar një CV profesionale.
                </li>
                <li>
                  <span className="font-medium text-foreground">Komunikimi:</span> Dërgimi i njoftimeve për aplikime të reja,
                  punë të reja që përputhen me profilin tuaj dhe përditësime të platformës.
                </li>
                <li>
                  <span className="font-medium text-foreground">Siguria:</span> Mbrojtja e platformës nga aktiviteti keqdashës,
                  mashtrimi dhe përdorimi i paautorizuar.
                </li>
                <li>
                  <span className="font-medium text-foreground">Përmirësimi:</span> Analizimi i përdorimit të platformës për
                  të përmirësuar shërbimet dhe përvojën e përdoruesit.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Cookies */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Cookie className="h-5 w-5 text-primary flex-shrink-0" />
                Cookies dhe Teknologji të Ngjashme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al përdor një numër minimal cookies dhe teknologjish ruajtjeje lokale:
              </p>
              <div className="space-y-3">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-1">Ruajtja Lokale (localStorage)</h4>
                  <p className="text-sm">
                    Tokeni i autentikimit (JWT) ruhet në localStorage të shfletuesit tuaj për të mbajtur sesionin
                    aktiv. Ky token fshihet automatikisht kur dilni nga llogaria.
                  </p>
                </div>
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-1">Cookie e Vetme</h4>
                  <p className="text-sm">
                    Përdorim një cookie të vetme (<code className="bg-muted px-1 rounded">sidebar:state</code>) për
                    të ruajtur gjendjen e menysë anësore. Kjo cookie skadon pas 7 ditësh dhe nuk përmban
                    të dhëna personale.
                  </p>
                </div>
              </div>
              <p className="text-sm">
                Nuk përdorim cookies funksionale, analitike apo gjurmimi. Preferencat si gjuha dhe filtrat
                e kërkimit ruhen në gjendjen e aplikacionit ose në URL dhe nuk përdorin cookies.
              </p>
            </CardContent>
          </Card>

          {/* User Rights */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Shield className="h-5 w-5 text-primary flex-shrink-0" />
                Të Drejtat Tuaja
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Në përputhje me legjislacionin shqiptar për mbrojtjen e të dhënave personale (Ligji Nr. 9887),
                ju keni të drejtat e mëposhtme:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="font-medium text-foreground">E drejta e aksesit:</span> Mund të kërkoni një kopje të të
                  gjitha të dhënave personale që kemi ruajtur për ju.
                </li>
                <li>
                  <span className="font-medium text-foreground">E drejta e korrigjimit:</span> Mund të përditësoni ose
                  korrigjoni të dhënat tuaja në çdo kohë përmes profilit tuaj.
                </li>
                <li>
                  <span className="font-medium text-foreground">E drejta e fshirjes:</span> Mund të kërkoni fshirjen e llogarisë
                  dhe të gjitha të dhënave tuaja. Kjo do të kryhet brenda 30 ditëve.
                </li>
                <li>
                  <span className="font-medium text-foreground">E drejta e kufizimit:</span> Mund të kërkoni kufizimin e
                  përpunimit të të dhënave tuaja në rrethana të caktuara.
                </li>
                <li>
                  <span className="font-medium text-foreground">E drejta e transportueshmërisë:</span> Mund të shkarkoni të
                  dhënat tuaja në format JSON përmes profilit tuaj (Eksporto të Dhënat).
                </li>
                <li>
                  <span className="font-medium text-foreground">E drejta e kundërshtimit:</span> Mund të kundërshtoni
                  përpunimin e të dhënave tuaja për qëllime marketingu.
                </li>
              </ul>
              <p>
                Për të ushtruar ndonjë nga këto të drejta, na kontaktoni në adresën e emailit më poshtë.
              </p>
            </CardContent>
          </Card>

          {/* Data Security */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Shield className="h-5 w-5 text-primary flex-shrink-0" />
                Siguria e të Dhënave
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ne marrim masa të përshtatshme teknike dhe organizative për të mbrojtur të dhënat tuaja personale, duke përfshirë:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Enkriptimi i fjalëkalimeve me algoritme të avancuara (bcrypt)</li>
                <li>Komunikimi i sigurt përmes HTTPS/TLS</li>
                <li>Akses i kufizuar në të dhënat personale vetëm për punonjësit e autorizuar</li>
                <li>Monitorimi i vazhdueshëm i sistemeve për aktivitet të dyshimtë</li>
                <li>Kopje rezervë të rregullta të të dhënave</li>
              </ul>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Mail className="h-5 w-5 text-primary flex-shrink-0" />
                Na Kontaktoni
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Nëse keni pyetje ose shqetësime në lidhje me privatësinë tuaj, ose dëshironi të ushtroni
                të drejtat tuaja, na kontaktoni:
              </p>
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p><span className="font-medium text-foreground">Email:</span> privacy@advance.al</p>
                <p><span className="font-medium text-foreground">Platforma:</span> advance.al</p>
                <p><span className="font-medium text-foreground">Vendndodhja:</span> Tiranë, Shqipëri</p>
              </div>
              <p className="text-sm">
                Do t'ju përgjigjemi brenda 15 ditëve pune nga data e marrjes së kërkesës suaj.
              </p>
            </CardContent>
          </Card>

          {/* Links */}
          <div className="text-center text-sm text-muted-foreground pt-4">
            <p>
              Shikoni gjithashtu:{" "}
              <Link to="/terms" className="text-primary hover:underline font-medium">
                Kushtet e Përdorimit
              </Link>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Privacy;
