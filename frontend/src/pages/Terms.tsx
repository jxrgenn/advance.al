import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { FileText, BookOpen, UserCog, ShieldAlert, Briefcase, FileCheck, Copyright, Scale, Ban, Mail, CreditCard, Brain, Globe, AlertTriangle, Gavel } from "lucide-react";

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
            Përditësuar së fundmi: Mars 2026 — Versioni 1.0
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
                <BookOpen className="h-5 w-5 text-primary flex-shrink-0" />
                1. Hyrje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Këto kushte përdorimi ("Kushtet") përbëjnë një marrëveshje ligjërisht detyruese ndërmjet jush
                ("Përdoruesi") dhe JXSOFT ("ne", "Kompania"), që operon platformën advance.al ("Platforma").
              </p>
              <p>
                Kjo marrëveshje rregullohet nga legjislacioni i Republikës së Shqipërisë, duke përfshirë Kodin Civil
                të Republikës së Shqipërisë dhe Ligjin Nr. 9901, datë 14.04.2008 "Për Tregtarët dhe Shoqëritë Tregtare"
                (i ndryshuar).
              </p>
              <p>
                Duke aksesuar ose përdorur advance.al, ju pranoni të respektoni këto Kushte. Nëse nuk jeni dakord
                me ndonjë nga kushtet e mëposhtme, ju lutemi mos përdorni Platformën tonë.
              </p>
              <p className="text-sm">
                <span className="font-medium text-foreground">Ndryshimet:</span> Ne rezervojmë të drejtën për të
                ndryshuar këto Kushte. Për ndryshime thelbësore, do t'ju njoftojmë të paktën 15 ditë përpara hyrjes
                në fuqi përmes emailit ose njoftimit në Platformë. Vazhdimi i përdorimit pas njoftimit përbën pranimin
                e kushteve të reja.
              </p>
            </CardContent>
          </Card>

          {/* 2. Service Description */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Globe className="h-5 w-5 text-primary flex-shrink-0" />
                2. Përshkrimi i Shërbimit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al është një platformë tregu pune (job marketplace) që mundëson lidhjen ndërmjet
                punëkërkuesve dhe punëdhënësve, duke ofruar shërbime si:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Publikimi dhe kërkimi i njoftimeve të punës</li>
                <li>Aplikimi për punë dhe menaxhimi i aplikimeve</li>
                <li>Gjenerimi i CV-ve me inteligjencë artificiale</li>
                <li>Përputhja inteligjente e kandidatëve me punët</li>
                <li>Profile kompanish dhe punëkërkuesish</li>
              </ul>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">Çfarë advance.al NUK është</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Nuk jemi agjenci punësimi dhe nuk ofrojmë shërbime ndërmjetësimi pune</li>
                  <li>Nuk jemi firmë rekrutimi (staffing firm) dhe nuk punësojmë persona</li>
                  <li>Nuk garantojmë punësimin ose gjetjen e kandidatëve</li>
                  <li>Nuk jemi palë në marrëdhënien e punës ndërmjet punëdhënësit dhe punëkërkuesit</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* 3. Account Rules */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <UserCog className="h-5 w-5 text-primary flex-shrink-0" />
                3. Rregullat e Llogarisë
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Për të përdorur shërbimet e advance.al, duhet të krijoni një llogari. Duke u regjistruar, ju pranoni që:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="font-medium text-foreground">Mosha minimale:</span> Duhet të jeni të paktën 16 vjeç
                  për të krijuar një llogari në Platformë.
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
              <p className="text-sm">
                Duke krijuar një llogari, ju jepni pëlqimin tuaj për përpunimin e të dhënave sipas{" "}
                <Link to="/privacy" className="text-primary hover:underline font-medium">
                  Politikës së Privatësisë
                </Link>
                . Versioni i pëlqimit regjistrohet në sistemin tonë.
              </p>
            </CardContent>
          </Card>

          {/* 4. Paid Services */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <CreditCard className="h-5 w-5 text-primary flex-shrink-0" />
                4. Shërbimet me Pagesë
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al ofron shërbime bazë falas dhe shërbime premium me pagesë. Shërbimet me pagesë
                përfshijnë (por nuk kufizohen në):
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Përputhja e avancuar e kandidatëve me inteligjencë artificiale</li>
                <li>Funksionalitete shtesë për punëdhënësit</li>
              </ul>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Pagesa</h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                  <li>Pagesat përpunohen përmes Paysera, një ofrues i licencuar pagesash</li>
                  <li>Monedha e pagesave: EUR</li>
                  <li>Çmimet shfaqen me TVSH-në e përfshirë (nëse aplikohet)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Politika e Rimbursimit</h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                  <li>Për shërbime që janë dorëzuar (p.sh. rezultate përputhje të gjeneruara), nuk ofrohet rimbursim</li>
                  <li>Për shërbime të padorëzuara, mund të kërkoni rimbursim brenda 14 ditëve nga blerja</li>
                  <li>Kërkesat për rimbursim dërgohen në support@advance.al</li>
                </ul>
              </div>

              <p className="text-sm">
                <span className="font-medium text-foreground">Ndryshimi i çmimeve:</span> Ne rezervojmë të drejtën për të
                ndryshuar çmimet e shërbimeve me pagesë duke ju njoftuar të paktën 30 ditë përpara.
              </p>
            </CardContent>
          </Card>

          {/* 5. User Responsibilities */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <ShieldAlert className="h-5 w-5 text-primary flex-shrink-0" />
                5. Përgjegjësitë e Përdoruesit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Duke përdorur Platformën, ju pranoni të mos kryeni veprimet e mëposhtme:</p>
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
                  diskriminimi ose sjellja abuzive ndaj përdoruesve të tjerë.
                </li>
                <li>
                  <span className="font-medium text-foreground">Përmbajtje e paligjshme:</span> Ngarkimi ose shpërndarja
                  e përmbajtjes që shkel ligjet e Republikës së Shqipërisë ose të drejtat e të tjerëve.
                </li>
                <li>
                  <span className="font-medium text-foreground">Manipulimi i sistemit:</span> Përdorimi i robotëve,
                  skripteve ose mjeteve automatike për të aksesuar ose manipuluar Platformën.
                </li>
                <li>
                  <span className="font-medium text-foreground">Mbledhja e të dhënave:</span> Mbledhja, ruajtja ose
                  shpërndarja e të dhënave personale të përdoruesve të tjerë pa pëlqimin e tyre.
                </li>
                <li>
                  <span className="font-medium text-foreground">Inxhinieria e kundërt:</span> Tentativa për të zbërthyer,
                  kopjuar ose rikrijuar sistemet e inteligjencës artificiale ose algoritmet e Platformës.
                </li>
                <li>
                  <span className="font-medium text-foreground">Keqpërdorimi i AI:</span> Përdorimi i mjeteve të AI
                  të Platformës për të krijuar përmbajtje mashtruese, diskriminuese ose të rreme.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* 6. Job Posting Rules */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Briefcase className="h-5 w-5 text-primary flex-shrink-0" />
                6. Rregullat e Publikimit të Punëve
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
                  për pozicione pune të ligjshme. Ndalohet publikimi i njoftimeve për aktivitete të paligjshme.
                </li>
                <li>
                  <span className="font-medium text-foreground">Mosdiskriminimi:</span> Njoftimet nuk duhet të përmbajnë
                  kërkesa diskriminuese, në përputhje me Kodin e Punës së Republikës së Shqipërisë.
                </li>
                <li>
                  <span className="font-medium text-foreground">Pa tarifa për punëkërkuesit:</span> Ndalohet kërkimi i
                  pagesës nga punëkërkuesit për aplikime ose procese përzgjedhjeje.
                </li>
                <li>
                  <span className="font-medium text-foreground">Përditësimi i statusit:</span> Punëdhënësit duhet të
                  përditësojnë statusin e njoftimeve kur pozicioni plotësohet.
                </li>
              </ul>
              <p className="text-sm">
                <span className="font-medium text-foreground">E drejta e heqjes:</span> Ne rezervojmë të drejtën për
                të hequr çdo njoftim që nuk përputhet me këto rregulla ose me legjislacionin shqiptar, pa njoftim paraprak.
              </p>
            </CardContent>
          </Card>

          {/* 7. Application Rules */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <FileCheck className="h-5 w-5 text-primary flex-shrink-0" />
                7. Rregullat e Aplikimit për Punë
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
                  që janë relevante me profilin dhe aftësitë tuaja. Ndalohet dërgimi masiv i aplikimeve pa dallim.
                </li>
                <li>
                  <span className="font-medium text-foreground">Komunikim profesional:</span> Mbani një ton profesional
                  në të gjitha komunikimet me punëdhënësit përmes Platformës.
                </li>
                <li>
                  <span className="font-medium text-foreground">Respektimi i procesit:</span> Ndiqni procesin e aplikimit
                  të vendosur nga punëdhënësi dhe mos u përpiqni të anashkaloni sistemin e Platformës.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* 8. AI Usage Terms */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Brain className="h-5 w-5 text-primary flex-shrink-0" />
                8. Përdorimi i Inteligjencës Artificiale
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al ofron mjete të bazuara në inteligjencë artificiale. Duke i përdorur, ju pranoni kushtet
                e mëposhtme:
              </p>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Gjenerimi i CV-së</h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                  <li>Gjeneruesi i CV-së është një mjet këshillues dhe nuk garanton saktësinë e përmbajtjes</li>
                  <li>Ju jeni plotësisht përgjegjës për rishikimin dhe saktësinë e CV-së së gjeneruar</li>
                  <li>Ndalohet përdorimi i gjeneruesit për të krijuar kualifikime, eksperienca ose aftësi të rreme</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Përputhja e Kandidatëve</h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                  <li>Rezultatet e përputhjes (match scores) janë vlerësime orientuese, jo garanci punësimi</li>
                  <li>Algoritmet mund të kenë kufizime dhe nuk zëvendësojnë gjykimin njerëzor</li>
                  <li>Vendimi përfundimtar i punësimit merret gjithmonë nga punëdhënësi</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Analiza e CV-së</h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                  <li>Nxjerrja automatike e të dhënave nga CV mund të ketë gabime</li>
                  <li>Verifikoni gjithmonë informacionin e nxjerrë automatikisht përpara se ta konfirmoni</li>
                </ul>
              </div>

              <p className="text-sm">
                <span className="font-medium text-foreground">Pronësia e përmbajtjes:</span> Përmbajtja e gjeneruar
                nga mjetet e AI bazuar në të dhënat tuaja ju përket juve. Modelet dhe algoritmet themelore mbeten
                pronë e JXSOFT dhe ofruesve përkatës.
              </p>
            </CardContent>
          </Card>

          {/* 9. Intellectual Property */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Copyright className="h-5 w-5 text-primary flex-shrink-0" />
                9. Pronësia Intelektuale
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Të gjitha të drejtat e pronësisë intelektuale të Platformës advance.al, duke përfshirë por pa u kufizuar në
                kodin burimor, dizajnin, logon, emrin tregtar, tekstet dhe përmbajtjen origjinale, janë pronë ekskluzive e
                JXSOFT ose licencuesve të saj.
              </p>
              <p>
                Përdoruesit ruajnë pronësinë mbi përmbajtjen që ngarkojnë në Platformë (si CV-të, përshkrimet e kompanisë
                dhe njoftimet e punës). Megjithatë, duke ngarkuar përmbajtje, ju na jepni një licencë jo-ekskluzive, pa
                pagesë, për ta shfaqur, ruajtur dhe përpunuar atë në kuadër të ofrimit të shërbimeve tona.
              </p>
              <p>
                Përmbajtja e gjeneruar nga mjetet e AI bazuar në të dhënat tuaja ju përket juve. Modelet themelore të AI
                dhe algoritmet janë pronë e JXSOFT dhe ofruesve të teknologjisë (si OpenAI).
              </p>
              <p>
                Ndalohet kopjimi, modifikimi, shpërndarja ose ripërdorimi i çdo pjese të Platformës pa miratimin tonë
                të shkruar paraprak.
              </p>
            </CardContent>
          </Card>

          {/* 10. Limitation of Liability */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Scale className="h-5 w-5 text-primary flex-shrink-0" />
                10. Kufizimi i Përgjegjësisë
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                advance.al ofrohet "siç është" (as-is) dhe "siç disponohet" (as-available). Ne nuk garantojmë që
                Platforma do të jetë gjithmonë e disponueshme, pa gabime ose e sigurt.
              </p>
              <p>
                Ne nuk jemi përgjegjës për:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Saktësinë e informacionit të publikuar nga punëdhënësit ose punëkërkuesit</li>
                <li>Rezultatin e aplikimeve për punë ose proceseve të rekrutimit</li>
                <li>Saktësinë ose plotësinë e rezultateve të gjeneruara nga inteligjenca artificiale</li>
                <li>Humbjen e të dhënave për shkaqe teknike ose gabimesh sistemesh</li>
                <li>Ndërprerje shërbimi të shkaktuara nga ofrues të palës së tretë</li>
                <li>Dështimet e autentikimit ose problemet me kredencialet</li>
                <li>Veprimet ose mosveprimet e përdoruesve të tjerë të Platformës</li>
                <li>Ndërprerje të shërbimit për shkaqe teknike, mirëmbajtje ose forca madhore</li>
              </ul>
              <p>
                Në çdo rast, përgjegjësia jonë totale ndaj jush nuk do të kalojë shumën që keni paguar për shërbimet
                tona në 12 muajt e fundit, ose 100 EUR, cilado që është më e vogël.
              </p>
              <p className="text-sm">
                <span className="font-medium text-foreground">Përjashtim:</span> Ky kufizim nuk aplikohet për dëmet
                e shkaktuara nga neglizhenca e rëndë ose qëllimi i keq, në përputhje me Nenin 608 të Kodit Civil
                të Republikës së Shqipërisë.
              </p>
            </CardContent>
          </Card>

          {/* 11. Indemnification */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <AlertTriangle className="h-5 w-5 text-primary flex-shrink-0" />
                11. Dëmshpërblimi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ju pranoni të dëmshpërbleni dhe të mbani të padëmtuar JXSOFT, punonjësit, drejtuesit dhe partnerët
                e saj nga çdo pretendim, humbje, dëm ose shpenzim (duke përfshirë tarifat ligjore të arsyeshme) që
                rrjedhin nga:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Shkelja juaj e këtyre Kushteve të Përdorimit</li>
                <li>Shkelja e të drejtave të palëve të treta (duke përfshirë të drejtat e pronësisë intelektuale)</li>
                <li>Keqpërdorimi i Platformës ose shërbimeve të saj</li>
                <li>Përmbajtja që ju ngarkoni ose publikoni në Platformë</li>
                <li>Shkelja e ligjeve ose rregulloreve të aplikueshme</li>
              </ul>
            </CardContent>
          </Card>

          {/* 12. Service Availability */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Globe className="h-5 w-5 text-primary flex-shrink-0" />
                12. Disponueshmëria e Shërbimit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ne përpiqemi të ofrojmë një shërbim të qëndrueshëm dhe të besueshëm, por nuk garantojmë
                disponueshmëri të pandërprerë (uptime).
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>
                  <span className="font-medium text-foreground">Mirëmbajtja:</span> Mund të kryejmë mirëmbajtje
                  të planifikuar që mund të shkaktoj ndërprerje të përkohshme. Do të përpiqemi t'ju njoftojmë paraprakisht.
                </li>
                <li>
                  <span className="font-medium text-foreground">Modifikimi:</span> Ne rezervojmë të drejtën për të
                  modifikuar, pezulluar ose ndërprerë çdo pjesë të Platformës në çdo kohë.
                </li>
                <li>
                  <span className="font-medium text-foreground">Ofruesit e palës së tretë:</span> Disponueshmëria
                  mund të ndikohet nga ofruesit e infrastrukturës (Railway, Vercel, MongoDB Atlas).
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* 13. Force Majeure */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <AlertTriangle className="h-5 w-5 text-primary flex-shrink-0" />
                13. Forca Madhore
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ne nuk do të mbajmë përgjegjësi për vonesën ose pamundësinë e përmbushjes së detyrimeve tona
                për shkak të ngjarjeve jashtë kontrollit tonë të arsyeshëm, duke përfshirë por pa u kufizuar në:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Fatkeqësi natyrore (tërmete, përmbytje, epidemi)</li>
                <li>Luftëra, akte terroriste ose sanksione</li>
                <li>Ndërprerje masive të infrastrukturës së internetit</li>
                <li>Sulme kibernetike masive</li>
                <li>Vendime qeveritare ose ligjore që pengojnë ofrimin e shërbimit</li>
              </ul>
              <p>
                Në rast force madhore, detyrimet tona pezullohen për kohëzgjatjen e ngjarjes.
              </p>
            </CardContent>
          </Card>

          {/* 14. Termination */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Ban className="h-5 w-5 text-primary flex-shrink-0" />
                14. Pezullimi dhe Mbyllja e Llogarisë
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Ne rezervojmë të drejtën për të pezulluar ose mbyllur llogarinë tuaj në rastet e mëposhtme:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Shkelja e ndonjë nga Kushtet e Përdorimit të përcaktuara në këtë dokument</li>
                <li>Përdorimi i Platformës për aktivitete të paligjshme ose mashtruese</li>
                <li>Publikimi i përmbajtjes së papërshtatshme, ofenduese ose diskriminuese</li>
                <li>Krijimi i llogarive të shumëfishta ose përdorimi i identiteteve të rreme</li>
                <li>Tentativa për të komprometuar sigurinë e Platformës</li>
                <li>Mosaktiviteti i zgjatur (më shumë se 24 muaj pa hyrje në llogari)</li>
              </ul>
              <p>
                Ju gjithashtu mund të mbyllni llogarinë tuaj në çdo kohë përmes cilësimeve të profilit ose duke na kontaktuar.
              </p>
              <div className="bg-muted/50 p-4 rounded-lg text-sm space-y-2">
                <p>
                  <span className="font-medium text-foreground">Shërbimet me pagesë:</span> Në rast mbylljeje të llogarisë
                  për shkak të shkeljeve, shërbimet me pagesë të papërdorura nuk rimbursohen.
                </p>
                <p>
                  <span className="font-medium text-foreground">Të dhënat:</span> Pas mbylljes së llogarisë, të dhënat
                  tuaja do të trajtohen sipas periudhave të ruajtjes të përcaktuara në{" "}
                  <Link to="/privacy" className="text-primary hover:underline font-medium">
                    Politikën e Privatësisë
                  </Link>.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 15. General Provisions */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Gavel className="h-5 w-5 text-primary flex-shrink-0" />
                15. Dispozita të Përgjithshme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <div>
                <h4 className="font-semibold text-foreground mb-2">Ligji i Aplikueshëm</h4>
                <p className="text-sm ml-2">
                  Këto Kushte rregullohen nga dhe interpretohen në përputhje me ligjet e Republikës së Shqipërisë.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Juridiksioni</h4>
                <p className="text-sm ml-2">
                  Çdo mosmarrëveshje që lidhet me këto Kushte do t'i nënshtrohet juridiksionit ekskluziv të
                  gjykatave kompetente të Rrethit Gjyqësor Tiranë.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Zgjidhja e Mosmarrëveshjeve</h4>
                <p className="text-sm ml-2">
                  Përpara se të ndërmarrin veprime ligjore, palët do të përpiqen të zgjidhin mosmarrëveshjen
                  përmes:
                </p>
                <ol className="list-decimal list-inside space-y-1 ml-4 text-sm">
                  <li>Negocimi direkt ndërmjet palëve (periudhë 30-ditore)</li>
                  <li>Ndërmjetësimi (mediacion) sipas Ligjit Nr. 10385, datë 24.02.2011 "Për Ndërmjetësimin
                    në Zgjidhjen e Mosmarrëveshjeve"</li>
                  <li>Nëse ndërmjetësimi dështon, çështja kalon në gjykatë</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Ndashhmëria</h4>
                <p className="text-sm ml-2">
                  Nëse ndonjë dispozitë e këtyre Kushteve konsiderohet e pavlefshme ose e pazbatueshme,
                  dispozitat e mbetura do të vazhdojnë të jenë në fuqi.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Marrëveshja e Plotë</h4>
                <p className="text-sm ml-2">
                  Këto Kushte, së bashku me Politikën e Privatësisë, përbëjnë marrëveshjen e plotë ndërmjet
                  jush dhe JXSOFT në lidhje me përdorimin e Platformës.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Lidhjet e Palëve të Treta</h4>
                <p className="text-sm ml-2">
                  Platforma mund të përmbajë lidhje me faqe interneti të palëve të treta. Ne nuk jemi përgjegjës
                  për përmbajtjen ose praktikat e privatësisë të këtyre faqeve.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Heqja Dorë</h4>
                <p className="text-sm ml-2">
                  Dështimi ynë për të zbatuar ndonjë dispozitë nuk përbën heqje dorë nga e drejta për ta zbatuar
                  atë në të ardhmen.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Cedimi</h4>
                <p className="text-sm ml-2">
                  Ju nuk mund t'i cedoni ose transferoni të drejtat tuaja sipas këtyre Kushteve pa miratimin tonë
                  të shkruar. Ne mund t'i cedojmë të drejtat tona pa kufizim.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 16. Contact */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Mail className="h-5 w-5 text-primary flex-shrink-0" />
                16. Na Kontaktoni
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Nëse keni pyetje ose shqetësime në lidhje me Kushtet e Përdorimit, ose keni nevojë për sqarime,
                na kontaktoni:
              </p>
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p><span className="font-medium text-foreground">Kompania:</span> JXSOFT</p>
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
