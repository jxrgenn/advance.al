import PDFDocument from 'pdfkit';

/**
 * PDF renderer for AI-generated CVs.
 *
 * Mirrors the section structure / labels of cvDocumentService.js (the DOCX
 * renderer) so the two outputs are the same CV in two formats. Both are
 * rendered from the identical `cvData` produced by the single OpenAI call,
 * so generating the PDF costs only a few milliseconds of layout work — no
 * extra API spend.
 *
 * pdfkit's built-in Helvetica fonts use WinAnsi encoding, which covers the
 * Albanian diacritics (ë, ç) — no embedded font needed.
 */

const COLORS = {
  primary: '#1e3a8a',   // dark blue — name + section headings
  secondary: '#64748b', // slate gray — dates, meta
  accent: '#0ea5e9',    // sky blue — title, achievements
  text: '#1e293b',      // dark slate — body
  rule: '#cbd5e1',      // light gray — section divider rule
};

/**
 * @param {object} cvData - structured CV data extracted by OpenAI
 * @param {string} language - 'sq' (Albanian) or 'en'
 * @returns {Promise<Buffer>} the PDF as a Buffer
 */
export async function generateCVPdf(cvData, language = 'sq') {
  const labels = language === 'sq' ? LABELS_SQ : LABELS_EN;

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 54, bottom: 54, left: 54, right: 54 }, // ~0.75in
    bufferPages: true,
  });

  const bufferPromise = collectBuffer(doc);

  // ── Header: name + title ────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(24).fillColor(COLORS.primary)
    .text(cvData.personalInfo?.fullName || labels.yourName);

  if (cvData.personalInfo?.title) {
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.accent)
      .text(cvData.personalInfo.title);
  }

  // ── Contact lines ───────────────────────────────────────────────────────
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
  const contact = cvData.personalInfo || {};
  if (contact.email) doc.text(`${labels.email}: ${contact.email}`);
  if (contact.phone) doc.text(`${labels.phone}: ${contact.phone}`);
  if (contact.address) doc.text(`${labels.address}: ${contact.address}`);
  if (contact.linkedIn) doc.text(`LinkedIn: ${contact.linkedIn}`);

  // ── Professional summary ────────────────────────────────────────────────
  if (cvData.professionalSummary) {
    sectionHeading(doc, labels.professionalSummary);
    doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.text)
      .text(cvData.professionalSummary, { align: 'justify' });
  }

  // ── Work experience ─────────────────────────────────────────────────────
  if (cvData.workExperience?.length > 0) {
    sectionHeading(doc, labels.workExperience);
    cvData.workExperience.forEach((exp, i) => {
      if (i > 0) doc.moveDown(0.6);

      doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.text)
        .text(`${exp.position || ''}${exp.company ? ` - ${exp.company}` : ''}`);

      const dateRange = exp.current
        ? `${exp.startDate || ''} - ${labels.present}`
        : `${exp.startDate || ''} - ${exp.endDate || ''}`;
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLORS.secondary)
        .text(dateRange.trim());
      if (exp.location) {
        doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLORS.secondary)
          .text(exp.location);
      }

      if (exp.responsibilities?.length > 0) {
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
        exp.responsibilities.forEach((resp) => doc.text(`•  ${resp}`, { indent: 6 }));
      }

      if (exp.achievements?.length > 0) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text)
          .text(`${labels.achievements}:`);
        // Use a WinAnsi-safe bullet — pdfkit's Helvetica can't render ✓.
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.accent);
        exp.achievements.forEach((a) => doc.text(`•  ${a}`, { indent: 6 }));
      }
    });
  }

  // ── Education ───────────────────────────────────────────────────────────
  if (cvData.education?.length > 0) {
    sectionHeading(doc, labels.education);
    cvData.education.forEach((edu, i) => {
      if (i > 0) doc.moveDown(0.5);

      doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.text)
        .text(`${edu.degree || ''}${edu.fieldOfStudy ? ` - ${edu.fieldOfStudy}` : ''}`);
      if (edu.institution) {
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.text).text(edu.institution);
      }
      const eduDate = edu.current
        ? `${edu.startDate || ''} - ${labels.present}`
        : `${edu.startDate || ''} - ${edu.endDate || ''}`;
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLORS.secondary)
        .text(eduDate.trim());
      if (edu.gpa || edu.honors) {
        const extras = [];
        if (edu.gpa) extras.push(`${labels.gpa}: ${edu.gpa}`);
        if (edu.honors) extras.push(edu.honors);
        doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.secondary)
          .text(extras.join('  |  '));
      }
    });
  }

  // ── Skills ──────────────────────────────────────────────────────────────
  const skills = cvData.skills || {};
  if (skills.technical?.length > 0 || skills.soft?.length > 0 || skills.tools?.length > 0) {
    sectionHeading(doc, labels.skills);
    const skillLine = (label, list) => {
      if (!list?.length) return;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text)
        .text(`${label}: `, { continued: true });
      doc.font('Helvetica').fillColor(COLORS.text).text(list.join(', '));
    };
    skillLine(labels.technicalSkills, skills.technical);
    skillLine(labels.softSkills, skills.soft);
    skillLine(labels.tools, skills.tools);
  }

  // ── Languages ───────────────────────────────────────────────────────────
  if (cvData.languages?.length > 0) {
    sectionHeading(doc, labels.languages);
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
    cvData.languages.forEach((lang) => doc.text(`${lang.name}: ${lang.proficiency}`));
  }

  // ── Certifications ──────────────────────────────────────────────────────
  if (cvData.certifications?.length > 0) {
    sectionHeading(doc, labels.certifications);
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
    cvData.certifications.forEach((cert) => {
      const text = cert.issuer
        ? `${cert.name} - ${cert.issuer}${cert.dateObtained ? ` (${cert.dateObtained})` : ''}`
        : cert.name;
      doc.text(text);
    });
  }

  // ── References ──────────────────────────────────────────────────────────
  if (cvData.references?.length > 0) {
    sectionHeading(doc, labels.references);
    cvData.references.forEach((ref, i) => {
      if (i > 0) doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text).text(ref.name || '');
      if (ref.position && ref.company) {
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.text)
          .text(`${ref.position} - ${ref.company}`);
      }
      const c = [ref.email, ref.phone].filter(Boolean).join('  |  ');
      if (c) doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.secondary).text(c);
    });
  }

  doc.end();
  return bufferPromise;
}

/** Draw a colored bold section heading with a divider rule above it. */
function sectionHeading(doc, text) {
  doc.moveDown(1);
  const y = doc.y;
  doc.strokeColor(COLORS.rule).lineWidth(0.75)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.primary).text(text);
  doc.moveDown(0.3);
}

/** Collect a pdfkit document stream into a single Buffer. */
function collectBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

const LABELS_SQ = {
  yourName: 'Emri Juaj',
  email: 'Email',
  phone: 'Telefon',
  address: 'Adresë',
  professionalSummary: 'Përmbledhje Profesionale',
  workExperience: 'Eksperienca Profesionale',
  education: 'Arsimi',
  skills: 'Aftësitë',
  technicalSkills: 'Aftësi Teknike',
  softSkills: 'Aftësi të Buta',
  tools: 'Mjete/Software',
  languages: 'Gjuhët',
  certifications: 'Certifikatat',
  references: 'Referenca',
  present: 'Aktualisht',
  achievements: 'Arritje',
  gpa: 'Nota Mesatare',
};

const LABELS_EN = {
  yourName: 'Your Name',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  professionalSummary: 'Professional Summary',
  workExperience: 'Work Experience',
  education: 'Education',
  skills: 'Skills',
  technicalSkills: 'Technical Skills',
  softSkills: 'Soft Skills',
  tools: 'Tools/Software',
  languages: 'Languages',
  certifications: 'Certifications',
  references: 'References',
  present: 'Present',
  achievements: 'Achievements',
  gpa: 'GPA',
};
