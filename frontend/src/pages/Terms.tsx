import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { FileText, BookOpen, UserCog, ShieldAlert, Briefcase, FileCheck, Copyright, Scale, Ban, Mail } from "lucide-react";

const Terms = () => {
  return (
    <div className="relative bg-slate-50 selection:bg-blue-100 selection:text-blue-900 font-sans min-h-screen flex flex-col">
      <Navigation />

      {/* Header */}
      <section className="pt-28 pb-12 bg-gradient-to-br from-primary/5 to-primary/10">
        <div className="container mx-auto px-4 text-center">
          <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-6">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Kushtet e Përdorimit
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Lexoni me kujdes kushtet e përdorimit të platformës advance.al përpara se të përdorni shërbimet tona.
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
                <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
                Hyrje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al ("ne", "platforma") është një platformë punësimi në internet që operon në Republikën e Shqipërisë.
                Platforma mundëson lidhjen ndërmjet punëkërkuesve dhe punëdhënësve, duke ofruar shërbime si publikimi i
                njoftimeve të punës, aplikimi për punë, gjenerimi i CV-ve me inteligjencë artificiale dhe shumë të tjera.
              </p>
              <p>
                Duke aksesuar ose përdorur advance.al, ju pranoni të respektoni këto kushte përdorimi. Nëse nuk jeni dakord
                me ndonjë nga kushtet e mëposhtme, ju lutemi mos përdorni platformën tonë. Ne rezervojmë të drejtën për të
                ndryshuar këto kushte në çdo kohë, dhe ndryshimet hyjnë në fuqi menjëherë pas publikimit në platformë.
              </p>
            </CardContent>
          </Card>

          {/* Account Rules */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <UserCog className="h-5 w-5 text-primary flex-shrink-0" />
                Rregullat e Llogarisë
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Për të përdorur shërbimet e advance.al, duhet të krijoni një llogari. Duke u regjistruar, ju pranoni që:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="font-medium text-foreground">Mosha minimale:</span> Duhet të jeni të paktën 16 vjeç
                  për të krijuar një llogari në platformë.
                </li>
                <li>
                  <span className="font-medium text-foreground">Informacion i saktë:</span> Të gjitha të dhënat e
                  regjistrimit duhet të jenë të vërteta, të sakta dhe të përditësuara. Përdorimi i identiteteve të rreme
                  ose informacionit mashtrues është i ndaluar.
                </li>
                <li>
                  <span className="font-medium text-foreground">Siguria e llogarisë:</span> Ju jeni përgjegjës për ruajtjen
                  e konfidencialitetit të fjalëkalimit tuaj dhe për të gjitha aktivitetet që ndodhin nën llogarinë tuaj.
                </li>
                <li>
                  <span className="font-medium text-foreground">Një llogari për person:</span> Çdo individ mund të ketë
                  vetëm një llogari aktive. Krijimi i llogarive të shumëfishta është i ndaluar.
                </li>
                <li>
                  <span className="font-medium text-foreground">Njoftimi i menjëhershëm:</span> Duhet të na njoftoni
                  menjëherë nëse dyshoni se llogaria juaj është komprometuar ose aksesuar pa autorizim.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* User Responsibilities */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <ShieldAlert className="h-5 w-5 text-primary flex-shrink-0" />
                Përgjegjësitë e Përdoruesit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Duke përdorur platformën, ju pranoni të mos kryeni veprimet e mëposhtme:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="font-medium text-foreground">Spam dhe mesazhe të padëshiruara:</span> Dërgimi i
                  mesazheve të shumta të padëshiruara ose reklamave tek përdoruesit e tjerë.
                </li>
                <li>
                  <span className="font-medium text-foreground">Njoftimet e rreme:</span> Publikimi i njoftimeve të rreme
                  të punës, ofertave mashtruese ose informacionit që ka për qëllim të mashtroj përdoruesit.
                </li>
                <li>
                  <span className="font-medium text-foreground">Ngacmimi dhe diskriminimi:</span> Ngacmimi, kërcënimi,
                  diskriminimi ose sjellja abuzive ndaj përdoruesve të tjerë bazuar në racë, gjini, fe, orientim seksual,
                  aftësi të kufizuara ose çdo karakteristikë tjetër.
                </li>
                <li>
                  <span className="font-medium text-foreground">Përmbajtje e paligjshme:</span> Ngarkimi ose shpërndarja
                  e përmbajtjes që shkel ligjet e Republikës së Shqipërisë ose të drejtat e të tjerëve.
                </li>
                <li>
                  <span className="font-medium text-foreground">Manipulimi i sistemit:</span> Përdorimi i robotëve,
                  skripteve ose mjeteve automatike për të aksesuar ose manipuluar platformën.
                </li>
                <li>
                  <span className="font-medium text-foreground">Mbledhja e të dhënave:</span> Mbledhja, ruajtja ose
                  shpërndarja e të dhënave personale të përdoruesve të tjerë pa pëlqimin e tyre.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Job Posting Rules */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Briefcase className="h-5 w-5 text-primary flex-shrink-0" />
                Rregullat e Publikimit të Punëve
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Punëdhënësit që publikojnë njoftimet e punës në advance.al duhet të respektojnë rregullat e mëposhtme:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="font-medium text-foreground">Informacion i saktë:</span> Njoftimet duhet të përmbajnë
                  informacion të saktë për pozicionin, kërkesat, pagën (nëse tregohet) dhe kushtet e punës.
                </li>
                <li>
                  <span className="font-medium text-foreground">Punë të ligjshme:</span> Të gjitha njoftimet duhet të jenë
                  për pozicione pune të ligjshme. Ndalohet publikimi i njoftimeve për aktivitete të paligjshme ose skema
                  mashtruese.
                </li>
                <li>
                  <span className="font-medium text-foreground">Mosdiskriminimi:</span> Njoftimet nuk duhet të përmbajnë
                  kërkesa diskriminuese bazuar në gjini, moshë, racë, fe, orientim seksual, gjendje shëndetësore ose
                  aftësi të kufizuara, përveç kur kërkohet ligjërisht për natyrën e punës.
                </li>
                <li>
                  <span className="font-medium text-foreground">Pa tarifa për punëkërkuesit:</span> Ndalohet kërkimi i
                  pagesës nga punëkërkuesit për aplikime ose procese përzgjedhjeje.
                </li>
                <li>
                  <span className="font-medium text-foreground">Përditësimi i statusit:</span> Punëdhënësit duhet të
                  përditësojnë statusin e njoftimeve kur pozicioni plotësohet ose nuk është më i disponueshëm.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Application Rules */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <FileCheck className="h-5 w-5 text-primary flex-shrink-0" />
                Rregullat e Aplikimit për Punë
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Punëkërkuesit që aplikojnë për punë përmes advance.al duhet të respektojnë rregullat e mëposhtme:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="font-medium text-foreground">CV e vërtetë:</span> Të gjitha të dhënat në CV dhe profilin
                  tuaj duhet të jenë të vërteta dhe të sakta. Falsifikimi i eksperiencës, arsimimit ose aftësive është i ndaluar.
                </li>
                <li>
                  <span className="font-medium text-foreground">Aplikime të përgjegjshme:</span> Aplikoni vetëm për punë
                  që janë relevante me profilin dhe aftësitë tuaja. Ndalohet dërgimi masiv i aplikimeve pa dallim tek të gjitha
                  njoftimet.
                </li>
                <li>
                  <span className="font-medium text-foreground">Komunikim profesional:</span> Mbani një ton profesional
                  në të gjitha komunikimet me punëdhënësit përmes platformës.
                </li>
                <li>
                  <span className="font-medium text-foreground">Respektimi i procesit:</span> Ndiqni procesin e aplikimit
                  të vendosur nga punëdhënësi dhe mos u përpiqni të anashkaloni sistemin e platformës.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Intellectual Property */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Copyright className="h-5 w-5 text-primary flex-shrink-0" />
                Pronësia Intelektuale
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Të gjitha të drejtat e pronësisë intelektuale të platformës advance.al, duke përfshirë por pa u kufizuar në
                kodin burimor, dizajnin, logon, emrin tregtar, tekstet dhe përmbajtjen origjinale, janë pronë ekskluzive e
                advance.al ose licencuesve të saj.
              </p>
              <p>
                Përdoruesit ruajnë pronësinë mbi përmbajtjen që ngarkojnë në platformë (si CV-të, përshkrimet e kompanisë
                dhe njoftimet e punës). Megjithatë, duke ngarkuar përmbajtje, ju na jepni një licencë jo-ekskluzive, pa
                pagesë, për ta shfaqur, ruajtur dhe përpunuar atë në kuadër të ofrimit të shërbimeve tona.
              </p>
              <p>
                Ndalohet kopjimi, modifikimi, shpërndarja ose ripërdorimi i çdo pjese të platformës pa miratimin tonë
                të shkruar paraprak.
              </p>
            </CardContent>
          </Card>

          {/* Limitation of Liability */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Scale className="h-5 w-5 text-primary flex-shrink-0" />
                Kufizimi i Përgjegjësisë
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al ofrohet "siç është" dhe "siç disponohet". Ne nuk garantojmë që platforma do të jetë gjithmonë
                e disponueshme, pa gabime ose e sigurt.
              </p>
              <p>
                Ne nuk jemi përgjegjës për:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Saktësinë e informacionit të publikuar nga punëdhënësit ose punëkërkuesit</li>
                <li>Rezultatin e aplikimeve për punë ose proceseve të rekrutimit</li>
                <li>Humbje ose dëme që rrjedhin nga përdorimi ose pamundësia për të përdorur platformën</li>
                <li>Veprimet ose mosveprimet e përdoruesve të tjerë të platformës</li>
                <li>Ndërprerje të shërbimit për shkaqe teknike, mirëmbajtje ose forca madhore</li>
              </ul>
              <p>
                Në çdo rast, përgjegjësia jonë totale ndaj jush nuk do të kalojë shumën që keni paguar për shërbimet
                tona në 12 muajt e fundit, ose 100 EUR, cilado që është më e vogël.
              </p>
            </CardContent>
          </Card>

          {/* Termination */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Ban className="h-5 w-5 text-primary flex-shrink-0" />
                Pezullimi dhe Mbyllja e Llogarisë
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ne rezervojmë të drejtën për të pezulluar ose mbyllur llogarinë tuaj në rastet e mëposhtme:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Shkelja e ndonjë nga kushtet e përdorimit të përcaktuara në këtë dokument</li>
                <li>Përdorimi i platformës për aktivitete të paligjshme ose mashtruese</li>
                <li>Publikimi i përmbajtjes së papërshtatshme, ofenduese ose diskriminuese</li>
                <li>Krijimi i llogarive të shumëfishta ose përdorimi i identiteteve të rreme</li>
                <li>Tentativa për të komprometuar sigurinë e platformës ose të dhënat e përdoruesve të tjerë</li>
                <li>Mosaktiviteti i zgjatur (më shumë se 24 muaj pa hyrje në llogari)</li>
              </ul>
              <p>
                Ju gjithashtu mund të mbyllni llogarinë tuaj në çdo kohë përmes cilësimeve të profilit ose duke na kontaktuar
                direkt. Pas mbylljes së llogarisë, të dhënat tuaja do të trajtohen sipas Politikës sonë të Privatësisë.
              </p>
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
                Nëse keni pyetje ose shqetësime në lidhje me kushtet e përdorimit, ose keni nevojë për sqarime,
                na kontaktoni:
              </p>
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p><span className="font-medium text-foreground">Email:</span> support@advance.al</p>
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
              <Link to="/privacy" className="text-primary hover:underline font-medium">
                Politika e Privatësisë
              </Link>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Terms;