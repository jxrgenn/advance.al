import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Shield, Database, Cookie, UserCheck, Mail, Eye, Building2, Scale, Globe, Brain, Clock, Users } from "lucide-react";

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

          {/* 1. Introduction */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Eye className="h-5 w-5 text-primary flex-shrink-0" />
                1. Hyrje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al ("ne", "platforma") është një platformë punësimi në internet që operon në Republikën e Shqipërisë.
                Kjo politikë privatësie shpjegon se si ne mbledhim, përdorim, ruajmë dhe mbrojmë informacionin tuaj personal
                kur përdorni shërbimet tona.
              </p>
              <p>
                Kjo politikë është hartuar në përputhje me Ligjin Nr. 9887, datë 10.03.2008 "Për Mbrojtjen e të Dhënave
                Personale" (i ndryshuar), si dhe parimet e Rregullores së Përgjithshme për Mbrojtjen e të Dhënave (GDPR)
                të Bashkimit Evropian, me të cilën legjislacioni shqiptar është i harmonizuar.
              </p>
              <p>
                Duke përdorur advance.al, ju pranoni praktikat e përshkruara në këtë politikë. Nëse nuk jeni dakord me këtë
                politikë, ju lutemi mos përdorni platformën tonë.
              </p>
              <p className="text-sm">
                <span className="font-medium text-foreground">Data e hyrjes në fuqi:</span> 28 Mars 2026
              </p>
            </CardContent>
          </Card>

          {/* 2. Data Controller */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
                2. Kontrolluesi i të Dhënave
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Kontrolluesi i të dhënave personale të përpunuara përmes platformës advance.al është:
              </p>
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p><span className="font-medium text-foreground">Kompania:</span> JXSOFT</p>
                <p><span className="font-medium text-foreground">Adresa:</span> Tiranë, Shqipëri</p>
                <p><span className="font-medium text-foreground">Email kontakti:</span> privacy@advance.al</p>
              </div>
              <p className="text-sm">
                Duke qenë një kompani e vogël, aktualisht nuk kemi caktuar një Oficer për Mbrojtjen e të Dhënave (DPO).
                Për çdo çështje që lidhet me privatësinë, mund të na kontaktoni drejtpërdrejt në adresën e emailit të mësipërme.
              </p>
            </CardContent>
          </Card>

          {/* 3. Data Collection */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Database className="h-5 w-5 text-primary flex-shrink-0" />
                3. Të Dhënat që Mbledhim
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
                  <li>Fjalëkalimi (i enkriptuar me bcrypt)</li>
                  <li>Roli në platformë (punëkërkues ose punëdhënës)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Informacioni i Profilit të Punëkërkuesit</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>CV dhe dokumentet e ngarkuara (PDF, DOCX)</li>
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
                  <li>Numri i regjistrimit të biznesit</li>
                  <li>Adresa dhe vendndodhja</li>
                  <li>Njoftimet e punës së publikuara</li>
                  <li>Logoja e kompanisë</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Të Dhënat e Aplikimeve</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Aplikimet për punë dhe statusi i tyre</li>
                  <li>Letra motivuese dhe përgjigjet e pyetjeve</li>
                  <li>Rezultatet e përputhjes me AI (match scores)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Të Dhëna Teknike</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Adresa IP dhe lloji i shfletuesit (për diagnostikim)</li>
                  <li>Të dhëna gabimesh përmes Sentry (stack traces, konteksti i gabimit)</li>
                  <li>Vektore semantike (embeddings) të gjeneruara nga profili juaj për përputhjen e punëve</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Të Dhëna Pagese (në të ardhmen)</h4>
                <p className="text-sm ml-2">
                  Kur shërbimet me pagesë aktivizohen, pagesat do të përpunohen përmes Paysera. Ne nuk ruajmë
                  numrat e kartave të kreditit ose të dhëna të plota bankare në serverët tanë.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 4. Legal Basis */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Scale className="h-5 w-5 text-primary flex-shrink-0" />
                4. Baza Ligjore për Përpunimin
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ne përpunojmë të dhënat tuaja personale bazuar në një ose më shumë nga bazat e mëposhtme ligjore:
              </p>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Pëlqimi (Neni 6 i Ligjit Nr. 9887)</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Gjenerimi i CV-së me inteligjencë artificiale</li>
                  <li>Përpunimi i CV-së për nxjerrjen e të dhënave (CV parsing)</li>
                  <li>Krijimi i vektorëve semantikë për përputhjen e punëve</li>
                  <li>Dërgimi i njoftimeve me email për punë të reja</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Domosdoshmëria Kontraktore</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Krijimi dhe menaxhimi i llogarisë</li>
                  <li>Publikimi i njoftimeve të punës</li>
                  <li>Përpunimi i aplikimeve për punë</li>
                  <li>Komunikimi ndërmjet punëkërkuesve dhe punëdhënësve</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Interesi Legjitim</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Siguria e platformës dhe parandalimi i mashtrimit</li>
                  <li>Monitorimi i gabimeve teknike (Sentry)</li>
                  <li>Përmirësimi i shërbimeve dhe përvojës së përdoruesit</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Detyrimi Ligjor</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Ruajtja e të dhënave sipas kërkesave ligjore shqiptare</li>
                  <li>Bashkëpunimi me autoritetet mbikëqyrëse kur kërkohet ligjërisht</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* 5. Data Usage */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <UserCheck className="h-5 w-5 text-primary flex-shrink-0" />
                5. Si i Përdorim të Dhënat
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
                  <span className="font-medium text-foreground">Përputhja e kandidatëve:</span> Përdorimi i algoritmeve të AI
                  për të sugjeruar kandidatë relevantë bazuar në kërkesat e punës dhe profilin e punëkërkuesit.
                </li>
                <li>
                  <span className="font-medium text-foreground">Gjenerimi i CV me AI:</span> Kur përdorni funksionin e gjenerimit
                  të CV-së, të dhënat tuaja përpunohen nga inteligjenca artificiale për të krijuar një CV profesionale.
                </li>
                <li>
                  <span className="font-medium text-foreground">Analiza e CV-së (Parsing):</span> Nxjerrja automatike e
                  informacionit nga CV-të e ngarkuara për të plotësuar profilin tuaj.
                </li>
                <li>
                  <span className="font-medium text-foreground">Vektorët semantikë:</span> Krijimi i përfaqësimeve numerike
                  (embeddings) të profilit tuaj për të mundësuar përputhjen inteligjente të punëve.
                </li>
                <li>
                  <span className="font-medium text-foreground">Komunikimi:</span> Dërgimi i njoftimeve për aplikime të reja,
                  punë të reja që përputhen me profilin tuaj dhe përditësime të platformës.
                </li>
                <li>
                  <span className="font-medium text-foreground">Monitorimi i gabimeve:</span> Përdorimi i Sentry për të
                  identifikuar dhe rregulluar gabimet teknike në platformë.
                </li>
                <li>
                  <span className="font-medium text-foreground">Siguria:</span> Mbrojtja e platformës nga aktiviteti keqdashës,
                  mashtrimi dhe përdorimi i paautorizuar.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* 6. AI Processing */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Brain className="h-5 w-5 text-primary flex-shrink-0" />
                6. Përpunimi me Inteligjencë Artificiale
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al përdor teknologji të inteligjencës artificiale për të ofruar shërbime të avancuara.
                Më poshtë shpjegojmë se si përdoren këto teknologji:
              </p>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Gjenerimi i CV-së</h4>
                <p className="ml-2 text-sm">
                  Kur kërkoni gjenerimin e një CV-je, të dhënat e profilit tuaj (emri, eksperienca, arsimimi, aftësitë)
                  dërgohen tek OpenAI (modeli GPT-4o-mini) për të krijuar një dokument CV të formatuar profesionalisht.
                  Të dhënat përdoren vetëm për këtë qëllim dhe nuk ruhen nga OpenAI për trajnim të modeleve.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Analiza e CV-së (CV Parsing)</h4>
                <p className="ml-2 text-sm">
                  Kur ngarkoni një CV (PDF ose DOCX), përmbajtja e saj analizohet me AI për të nxjerrë automatikisht
                  informacionin si eksperienca e punës, arsimimi dhe aftësitë. Kjo ju kursen kohë në plotësimin e profilit.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Vektorët Semantikë (Embeddings)</h4>
                <p className="ml-2 text-sm">
                  Profili juaj konvertohet në një vektor numerik (duke përdorur modelin text-embedding-3-small të OpenAI)
                  që mundëson përputhjen inteligjente me njoftimet e punës. Këta vektorë janë përfaqësime matematikore
                  dhe nuk mund të kthehen në tekst origjinal.
                </p>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">Vendimmarrja e Automatizuar</h4>
                <p className="text-sm">
                  Rezultatet e përputhjes (match scores) gjeneruara nga AI janë vetëm orientuese dhe nuk përbëjnë
                  vendimmarrje të automatizuar me efekte ligjore. Vendimi përfundimtar i punësimit merret gjithmonë
                  nga punëdhënësi. Ju keni të drejtë të kërkoni ndërhyrjen njerëzore në çdo vendim të bazuar në
                  përpunim automatik.
                </p>
              </div>

              <p className="text-sm">
                <span className="font-medium text-foreground">E drejta e ç'aktivizimit:</span> Ju mund të zgjidhni
                të mos përdorni shërbimet e AI duke mos përdorur funksionin e gjenerimit të CV-së dhe duke plotësuar
                profilin tuaj manualisht. Për çaktivizimin e vektorëve semantikë, na kontaktoni në privacy@advance.al.
              </p>
            </CardContent>
          </Card>

          {/* 7. Third-Party Sharing */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Users className="h-5 w-5 text-primary flex-shrink-0" />
                7. Ndarja e të Dhënave me Palë të Treta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ne ndajmë të dhënat tuaja vetëm me ofruesit e shërbimeve që janë të nevojshme për funksionimin
                e platformës:
              </p>

              <div className="space-y-3">
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-foreground text-sm">OpenAI (SHBA)</p>
                  <p className="text-xs">Gjenerimi i CV-ve, analiza e CV-ve, krijimi i vektorëve semantikë</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-foreground text-sm">MongoDB Atlas (AWS EU)</p>
                  <p className="text-xs">Ruajtja e të dhënave në databazë cloud</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-foreground text-sm">Cloudinary</p>
                  <p className="text-xs">Ruajtja dhe optimizimi i imazheve (foto profili, logot e kompanive)</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-foreground text-sm">Resend</p>
                  <p className="text-xs">Dërgimi i emaileve transaksionale (njoftimet, rivendosja e fjalëkalimit)</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-foreground text-sm">Sentry</p>
                  <p className="text-xs">Monitorimi i gabimeve teknike dhe performancës</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-foreground text-sm">Paysera (Lituani) — në të ardhmen</p>
                  <p className="text-xs">Përpunimi i pagesave kur shërbimet me pagesë aktivizohen</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="font-medium text-foreground text-sm">Railway / Vercel</p>
                  <p className="text-xs">Infrastruktura e hostimit të backend dhe frontend</p>
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-4 rounded-lg">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Ne NUK i shesim, tregëtojmë ose ndajmë të dhënat tuaja personale me palë të treta për qëllime
                  marketingu ose reklamimi.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 8. International Transfers */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Globe className="h-5 w-5 text-primary flex-shrink-0" />
                8. Transferimi Ndërkombëtar i të Dhënave
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Disa nga ofruesit tanë të shërbimeve operojnë jashtë Shqipërisë dhe Bashkimit Evropian, veçanërisht
                në Shtetet e Bashkuara të Amerikës (OpenAI, Sentry). Për këto transferime:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  Mbështetemi në Klauzolat Standarde Kontraktore (Standard Contractual Clauses — SCCs) të miratuara
                  nga Komisioni Evropian për transferimin e të dhënave jashtë hapësirës EEA.
                </li>
                <li>
                  Legjislacioni shqiptar për mbrojtjen e të dhënave është i harmonizuar me GDPR, duke siguruar një
                  nivel të përshtatshëm mbrojtjeje.
                </li>
                <li>
                  Ofruesit tanë kryesorë mbajnë certifikime të sigurisë si SOC 2 dhe/ose ISO 27001.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* 9. Cookies */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Cookie className="h-5 w-5 text-primary flex-shrink-0" />
                9. Cookies dhe Teknologji të Ngjashme
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
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-1">Sentry SDK</h4>
                  <p className="text-sm">
                    Sentry SDK mund të përdorë API-t e shfletuesit (si performance observers) për monitorimin e
                    gabimeve. Nuk vendos cookies gjurmimi dhe nuk krijon profile përdoruesish.
                  </p>
                </div>
              </div>
              <p className="text-sm">
                Nuk përdorim cookies analitike, reklamuese ose gjurmimi. Preferencat si gjuha dhe filtrat
                e kërkimit ruhen në gjendjen e aplikacionit ose në URL dhe nuk përdorin cookies.
              </p>
            </CardContent>
          </Card>

          {/* 10. Retention Periods */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Clock className="h-5 w-5 text-primary flex-shrink-0" />
                10. Periudhat e Ruajtjes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ne ruajmë të dhënat tuaja personale vetëm për aq kohë sa është e nevojshme:
              </p>
              <div className="space-y-3">
                <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-start">
                  <div>
                    <p className="font-medium text-foreground text-sm">Të dhënat e llogarisë aktive</p>
                    <p className="text-xs">Profili, CV, preferencat</p>
                  </div>
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">Derisa llogaria është aktive</span>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-start">
                  <div>
                    <p className="font-medium text-foreground text-sm">Pas fshirjes së llogarisë</p>
                    <p className="text-xs">Fshirja e plotë e të dhënave</p>
                  </div>
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">Brenda 30 ditëve</span>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-start">
                  <div>
                    <p className="font-medium text-foreground text-sm">Aplikimet për punë</p>
                    <p className="text-xs">Historiku i aplikimeve</p>
                  </div>
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">24 muaj</span>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-start">
                  <div>
                    <p className="font-medium text-foreground text-sm">Vektorët semantikë (embeddings)</p>
                    <p className="text-xs">Përfaqësimet numerike të profilit</p>
                  </div>
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">Bashkë me llogarinë</span>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-start">
                  <div>
                    <p className="font-medium text-foreground text-sm">Të dhënat e Sentry</p>
                    <p className="text-xs">Gabimet teknike dhe diagnostikimi</p>
                  </div>
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">90 ditë</span>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-start">
                  <div>
                    <p className="font-medium text-foreground text-sm">Tokenat JWT</p>
                    <p className="text-xs">Sesionet e autentikimit</p>
                  </div>
                  <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded">7 ditë</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 11. Your Rights */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Shield className="h-5 w-5 text-primary flex-shrink-0" />
                11. Të Drejtat Tuaja
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Në përputhje me Ligjin Nr. 9887 "Për Mbrojtjen e të Dhënave Personale" dhe parimet e GDPR,
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
                <li>
                  <span className="font-medium text-foreground">E drejta e tërheqjes së pëlqimit:</span> Mund të tërhiqni
                  pëlqimin tuaj për përpunimin e të dhënave në çdo kohë, pa ndikuar ligjshmërinë e përpunimit të kryer
                  përpara tërheqjes.
                </li>
                <li>
                  <span className="font-medium text-foreground">E drejta kundër vendimeve automatike:</span> Keni të drejtë
                  të mos i nënshtroheni një vendimi të bazuar vetëm në përpunim automatik, përfshirë profilizimin,
                  që prodhon efekte ligjore ose ju prek ndjeshëm.
                </li>
              </ul>

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">E drejta e ankimit</h4>
                <p className="text-sm">
                  Nëse mendoni se të dhënat tuaja personale janë përpunuar në mënyrë të paligjshme, keni të drejtë
                  të paraqisni ankim pranë Komisionerit për të Drejtën e Informimit dhe Mbrojtjen e të Dhënave Personale:
                </p>
                <div className="mt-2 text-sm">
                  <p><span className="font-medium text-foreground">Adresa:</span> Rruga "Abdi Toptani" Nr. 5, Tiranë</p>
                  <p><span className="font-medium text-foreground">Website:</span> idp.al</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 12. Children's Protection */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Users className="h-5 w-5 text-primary flex-shrink-0" />
                12. Mbrojtja e të Miturve
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al nuk është i destinuar për persona nën moshën 16 vjeç. Ne nuk mbledhim me dijeni
                të dhëna personale nga fëmijët nën 16 vjeç.
              </p>
              <p>
                Nëse zbulojmë se kemi mbledhur të dhëna personale nga një person nën 16 vjeç, do të ndërmarrim
                hapa të menjëhershme për të fshirë këto të dhëna nga sistemet tona.
              </p>
              <p className="text-sm">
                Nëse jeni prind ose kujdestar ligjor dhe besoni se fëmija juaj ka dhënë të dhëna personale
                në platformën tonë, ju lutemi na kontaktoni në privacy@advance.al.
              </p>
            </CardContent>
          </Card>

          {/* 13. Data Security */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Shield className="h-5 w-5 text-primary flex-shrink-0" />
                13. Siguria e të Dhënave
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ne marrim masa të përshtatshme teknike dhe organizative për të mbrojtur të dhënat tuaja personale:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Enkriptimi i fjalëkalimeve me bcrypt (12 raunde)</li>
                <li>Komunikimi i sigurt përmes HTTPS/TLS</li>
                <li>Mbrojtje kundër sulmeve CORS, XSS dhe injection përmes helmet.js</li>
                <li>Kufizimi i kërkesave (rate limiting) për parandalimin e sulmeve</li>
                <li>Akses i kufizuar në të dhënat personale vetëm për punonjësit e autorizuar</li>
                <li>Monitorimi i vazhdueshëm i sistemeve për aktivitet të dyshimtë</li>
                <li>Auditime të rregullta të sigurisë</li>
                <li>Kopje rezervë të rregullta të të dhënave</li>
              </ul>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">Njoftimi për Shkelje të Dhënash</h4>
                <p className="text-sm">
                  Në rast të një shkeljeje të sigurisë që prek të dhënat tuaja personale, ne do të njoftojmë
                  Komisionerin për Mbrojtjen e të Dhënave Personale brenda 72 orëve dhe do t'ju njoftojmë
                  ju drejtpërdrejt nëse shkelja paraqet rrezik të lartë për të drejtat dhe liritë tuaja.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 14. Contact */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Mail className="h-5 w-5 text-primary flex-shrink-0" />
                14. Na Kontaktoni
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Nëse keni pyetje ose shqetësime në lidhje me privatësinë tuaj, ose dëshironi të ushtroni
                të drejtat tuaja, na kontaktoni:
              </p>
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p><span className="font-medium text-foreground">Kontrolluesi i të Dhënave:</span> JXSOFT</p>
                <p><span className="font-medium text-foreground">Email:</span> privacy@advance.al</p>
                <p><span className="font-medium text-foreground">Platforma:</span> advance.al</p>
                <p><span className="font-medium text-foreground">Vendndodhja:</span> Tiranë, Shqipëri</p>
              </div>
              <p className="text-sm">
                Do t'ju përgjigjemi brenda 15 ditëve pune nga data e marrjes së kërkesës suaj.
              </p>
              <p className="text-sm">
                Nëse nuk jeni të kënaqur me përgjigjen tonë, keni të drejtë të paraqisni ankim pranë
                Komisionerit për të Drejtën e Informimit dhe Mbrojtjen e të Dhënave Personale (idp.al).
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
