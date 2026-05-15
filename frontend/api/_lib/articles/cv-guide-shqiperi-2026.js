// SAFETY AUDIT — see DEVELOPMENT_ROADMAP.md "Blog editorial doctrine" for the
// full checklist this article was reviewed against.
//
// - YMYL exposure: None (career-advice content)
// - Citations: Each external claim either softened to general HR knowledge OR
//   linked to a real public source. No invented statistics.
// - Example person ("Anjeza Sh."): Explicitly marked as fictional in-line.
// - Author: "Ekipi i advance.al" — see /about.
// - Disclaimer: Not required for non-YMYL career advice.
// - Internal-only commercial CTA: link to /jobs only.

const cvGuide = {
  slug: 'cv-guide-shqiperi-2026',
  title: 'Si të shkruash një CV efektive për tregun shqiptar — udhëzues 2026',
  description:
    "Udhëzues praktik për të shkruar një CV që funksionon në tregun shqiptar të punës: strukturë, çfarë të përfshini, gabime që duhen shmangur, dhe shembull konkret.",
  datePublished: '2026-05-15',
  dateModified: '2026-05-15',
  author: 'Ekipi i advance.al',
  readMinutes: 8,
  faq: [
    {
      q: 'Sa duhet të jetë e gjatë një CV?',
      a: 'Për pozicione fillestare, një faqe është optimale. Për profesionistë me 3+ vite eksperiencë, dy faqe maksimumi. Mbi dy faqe rrallë justifikohet — vetëm për pozicione drejtuese me eksperiencë të gjatë.',
    },
    {
      q: 'A duhet të vendos foto në CV?',
      a: "Në standardin europian foto po hiqet nga CV-ja. Në Shqipëri ende është e zakonshme, por nuk është e detyrueshme. Vendoseni vetëm nëse punëdhënësi e kërkon në shpalljen e punës.",
    },
    {
      q: 'Si të paraqes një boshllëk në punësim?',
      a: 'Përshkruani shkurt arsyen (studime, kujdes familjar, ristrukturim karriere) dhe çfarë keni mësuar gjatë asaj kohe. Transparenca është gjithmonë më e mirë sesa fshehja.',
    },
    {
      q: 'A duhet ta përkthej CV-në në anglisht?',
      a: 'Po, nëse aplikoni në një kompani ndërkombëtare ose në një pozicion ku kërkohet anglishtja. Mbani dy versione të përditësuara: shqip dhe anglisht.',
    },
    {
      q: 'A duhet të shtoj referenca?',
      a: 'Jo, përveç se kur kërkohen specifikisht në shpalljen e punës. Shkruani "Referenca në kërkesë" ose lëreni jashtë. Hapësira është më e vlefshme për përmbajtje të drejtpërdrejtë.',
    },
  ],
  bodyHtml: `      <p>Një CV (Curriculum Vitae) është dokumenti i parë që sheh çdo punëdhënës para se të vendosë nëse do t'ju ftojë në intervistë. Në një treg si Shqipëria, ku konkurrenca për pozicione të mira po rritet vit pas viti, një CV e shkruar mirë mund të bëjë diferencën midis një ftese dhe një moskthimi përgjigjeje.</p>

      <p>Ky udhëzues është për të gjithë ata që po kërkojnë punë në Shqipëri — qoftë puna e parë pas universitetit, ndryshimi i karrierës, apo kthimi në tregun e punës pas një pauze. Do ta ndajmë procesin në hapa konkretë, me shembuj që funksionojnë në kontekstin shqiptar.</p>

      <h2>Sa e gjatë duhet të jetë CV-ja?</h2>

      <p>Punëdhënësit kalojnë mesatarisht vetëm pak sekonda në një lexim të parë. Një CV katër-faqësh që përsërit detaje nuk lexohet — ajo kalon në grumbullin "jo". Si rregull i përgjithshëm:</p>

      <ul>
        <li><strong>1 faqe</strong> — studentë, të sapodiplomuar, pozicione fillestare</li>
        <li><strong>2 faqe</strong> — profesionistë me 3+ vite eksperiencë</li>
        <li><strong>Mbi 2 faqe</strong> — rrallë i justifikuar; vetëm për pozicione drejtuese me 10+ vite eksperiencë</li>
      </ul>

      <h2>Struktura bazë</h2>

      <p>Një CV efektive ka këto pjesë, në këtë renditje:</p>

      <ol>
        <li><strong>Të dhënat e kontaktit</strong> (lart, pa titull "Të dhëna personale")</li>
        <li><strong>Përmbledhje profesionale</strong> (2–3 fjali — opsionale por e dobishme)</li>
        <li><strong>Eksperienca e punës</strong> (kronologjike e kthyer — më e fundit lart)</li>
        <li><strong>Edukimi</strong> (kronologjike e kthyer)</li>
        <li><strong>Aftësitë</strong> (teknike + të buta)</li>
        <li><strong>Gjuhët</strong> (me nivel sipas CEFR)</li>
        <li><strong>Të tjera</strong> (certifikata, vullnetarizëm — vetëm nëse janë relevante)</li>
      </ol>

      <p>Renditja varet nga eksperienca: nëse jeni i sapodiplomuar, vendosni Edukimin para Eksperiencës. Nëse keni 3+ vite eksperiencë, Eksperienca shkon e para.</p>

      <h2>Të dhënat e kontaktit</h2>

      <p><strong>Çfarë të përfshini:</strong></p>
      <ul>
        <li>Emër dhe mbiemër (jo "Z." apo "Znj.")</li>
        <li>Numër telefoni me prefiks ndërkombëtar: +355 6X XXX XXXX</li>
        <li>Email profesional — formati ideal: <em>emer.mbiemer@gmail.com</em>, jo <em>"fitnesgirl_2003"</em></li>
        <li>Qytet (jo adresa e plotë — për arsye sigurie)</li>
        <li>Profil LinkedIn nëse e keni të përditësuar</li>
      </ul>

      <p><strong>Çfarë mos të përfshini:</strong></p>
      <ul>
        <li>Datëlindjen e plotë</li>
        <li>Statusin civil (i/e martuar, beqar/e)</li>
        <li>Fenë ose përkatësinë etnike</li>
        <li>Numra dokumentesh personale (numri i kartës së identitetit, NIPT)</li>
        <li>Foto — opsionale; në standardin europian po hiqet nga CV-ja, por në Shqipëri ende është e zakonshme. Vendoseni vetëm nëse e kërkon punëdhënësi.</li>
      </ul>

      <h2>Eksperienca e punës — bëje konkrete</h2>

      <p>Për çdo pozicion, përfshini:</p>

      <ul>
        <li>Titullin e pozicionit</li>
        <li>Emrin e kompanisë + qytetin</li>
        <li>Datat: muaj/vit – muaj/vit (p.sh. <em>Maj 2022 – Tetor 2024</em>)</li>
        <li>2–4 pika me përgjegjësitë kryesore dhe arritjet</li>
      </ul>

      <p>Përdorni <strong>verba veprimi</strong>: <em>gjenerova, ndërtova, menaxhova, optimizova, rrita</em>. Shmangni format e mjegullta si "isha përgjegjës për".</p>

      <p>Sasi konkretësinë. Krahasoni:</p>

      <ul>
        <li>❌ "Përgjegjës për shitjet"</li>
        <li>✅ "Menaxhova një portofol prej 45 klientësh; rrita xhiron mujore me 22% në 6 muaj"</li>
      </ul>

      <p>Numrat e bëjnë CV-në të besueshme dhe lehtësisht të krahasueshme. Nëse nuk keni numra të saktë, jepni diapazon ose përshkrim cilësor specifik (p.sh. "rritje e ndjeshme e produktivitetit"). Mospasja e datave të sakta është një shenjë e kuqe; nëse keni pasur ndërprerje, paraqitja e tyre është më e mirë sesa fshehja.</p>

      <h2>Edukimi</h2>

      <p>Universitet, qytet, fillim-mbarim (vitet), diplomë (Bachelor, Master, etj.), specializimi. Mesatarja shtohet vetëm nëse është mbi 8.5/10 (ose A-/A në sistemin amerikan) <em>dhe</em> jeni në fillim të karrierës. Trajnimet 1-ditore nuk shtohen; vendosni vetëm certifikata profesionale të njohura (PMP, AWS, Cisco, ACCA, etj.).</p>

      <h2>Aftësitë — specifike, jo gjenerike</h2>

      <p><strong>Aftësitë teknike (hard skills)</strong> janë specifike dhe të verifikueshme: gjuhë programimi, software profesional, makineri, procedura kontabël. Listë konkrete:</p>

      <ul>
        <li>❌ "Punë me kompjuter"</li>
        <li>✅ "Microsoft Excel (formula të avancuara, pivot tables, makro), Power BI, SQL bazik"</li>
      </ul>

      <p><strong>Aftësitë e buta (soft skills)</strong> — komunikim, lidership, zgjidhje problemesh — vendosen me kursim. Më mirë demonstrohen në seksionin e eksperiencës me shembuj konkretë sesa renditen si fjalë boshe.</p>

      <p><strong>Gjuhët</strong> sipas Kuadrit të Përbashkët Europian të Referimit (CEFR): A1, A2, B1, B2, C1, C2. P.sh.:</p>

      <ul>
        <li>Shqip — gjuhë amtare</li>
        <li>Anglisht — C1 (i avancuar)</li>
        <li>Italisht — B1 (i mesëm)</li>
      </ul>

      <h2>Gabimet më të zakonshme që duhen shmangur</h2>

      <ol>
        <li><strong>Gabime drejtshkrimore.</strong> Lexojeni CV-në 2–3 herë. Përdorni një mik si lexues të dytë. Një gabim drejtshkrimi i jep punëdhënësit ndjesinë që nuk jeni i kujdesshëm me detajet — një tipar i rëndësishëm në shumicën e profesioneve.</li>
        <li><strong>CV gjenerike për çdo aplikim.</strong> Përshtateni për çdo pozicion: fokusoni aftësitë dhe eksperiencat që janë më relevante për punën specifike. Një CV "një-për-të-gjitha" duket e tillë.</li>
        <li><strong>Format jo i lexueshëm.</strong> Përdorni një font profesional (Arial, Calibri, Helvetica), madhësi 10–11pt, margjina 2–2.5 cm. Asnjë font dekorativ.</li>
        <li><strong>Përdorimi i tabelave për layout.</strong> Sistemet automatike të leximit të CV-ve (ATS — Applicant Tracking Systems) që përdorin shumë kompani të mëdha mund të kenë vështirësi me tabelat. Përdorni strukturë lineare.</li>
        <li><strong>Hashtagje, emojis, ngjyra të shumta.</strong> Ruani CV-në në bardhë e zi me një ngjyrë teme në krye. Profesionale, jo dekorative.</li>
        <li><strong>Gënjeshtra ose ekzagjerime.</strong> Punëdhënësit serioz verifikojnë eksperiencat. Një gënjeshtër e zbuluar nuk vetëm që ju kushton pozicionin, por edhe reputacionin afatgjatë.</li>
      </ol>

      <h2>Shembull i shkurtër</h2>

      <p><em>Ky shembull është fiktiv — emrat e personave dhe kompanive nuk korrespondojnë me asnjë person ose biznes real.</em></p>

      <p><strong>Anjeza Sh.</strong> — 24 vjeçe, Tiranë, e diplomuar në Bachelor Ekonomi në Universitetin e Tiranës (2024), kërkon pozicion fillestar në marketing dixhital ose analizë biznesi.</p>

      <p><strong>Përmbledhje profesionale:</strong> E diplomuar e re në ekonomi me eksperiencë praktike në analizë të dhënash dhe marketing dixhital. Përdoruese e avancuar e Microsoft Excel dhe Google Analytics. Anglisht C1, italisht B1.</p>

      <p><strong>Eksperienca e punës:</strong></p>

      <ul>
        <li><em>Praktikante në Departamentin e Marketingut, [Kompani fiktive] – Tiranë</em> (Korrik – Shtator 2024): Asistova në krijimin e raporteve mujore të performancës; përdora Google Analytics për të identifikuar 3 segmente të reja klientësh.</li>
        <li><em>Asistente shitjeje (part-time), [Dyqan fiktiv] – Tiranë</em> (Shtator 2022 – Qershor 2024): Menaxhova klientelën dhe inventarin javor; bashkëpunova në fushatat e ofertave sezonale.</li>
      </ul>

      <h2>Hapi tjetër</h2>

      <p>Tani që CV-ja juaj është gati, hidhini një sy <a href="/jobs">pozicioneve aktive në advance.al</a>. Kemi punë në Tiranë, Durrës, Vlorë dhe gjithë Shqipërinë — me kompani të verifikuara dhe aplikim me një klik.</p>`,
};

export default cvGuide;
