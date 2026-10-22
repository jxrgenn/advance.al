import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, convertInchesToTwip } from 'docx';

// docx colors are hex WITHOUT '#'.
const COLORS = {
  primary: '1e3a8a', // Dark blue
  secondary: '64748b', // Slate gray
  accent: '0ea5e9', // Sky blue
  text: '1e293b' // Dark slate
};

/**
 * A paragraph whose TEXT carries the formatting (#65). In docx v9 a
 * Paragraph's `run` option styles only the paragraph mark, and `bold` /
 * `italics` are not Paragraph options at all — the visible text run was
 * unformatted (name, title, dates, "Arritje:" all came out in the default
 * body style). Formatting goes on a TextRun.
 */
function styledParagraph(text, runStyle = {}, paragraphOptions = {}) {
  return new Paragraph({
    ...paragraphOptions,
    children: [new TextRun({ text: String(text ?? ''), ...runStyle })],
  });
}

/** "start - end" / "start - Present"; '' when there is no date at all. */
function dateRange(entry, presentLabel) {
  const start = entry.startDate || '';
  const end = entry.current ? presentLabel : (entry.endDate || '');
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} - ${end}`;
}

/**
 * Generate a professional Word document CV from structured data
 * @param {object} cvData - The structured CV data extracted by OpenAI
 * @param {string} language - 'sq' for Albanian, 'en' for English
 * @returns {Promise<Buffer>} - The Word document as a buffer
 */
export async function generateCVDocument(cvData, language = 'sq') {
  const labels = language === 'sq' ? LABELS_SQ : LABELS_EN;

  const sections = [];

  // Candidate Name - LEFT ALIGNED
  sections.push(
    styledParagraph(cvData.personalInfo?.fullName || labels.yourName,
      { color: COLORS.primary, size: 36, bold: true },
      { alignment: AlignmentType.LEFT, spacing: { after: 100 } })
  );

  // Professional Title if available - LEFT ALIGNED
  if (cvData.personalInfo?.title) {
    sections.push(
      styledParagraph(cvData.personalInfo.title,
        { size: 24, color: COLORS.accent, bold: true },
        { alignment: AlignmentType.LEFT, spacing: { after: 200 } })
    );
  }

  // Contact Information - LEFT ALIGNED, ONE PER LINE
  if (cvData.personalInfo?.email) {
    sections.push(
      styledParagraph(`${labels.email}: ${cvData.personalInfo.email}`,
        { size: 20, color: COLORS.text },
        { alignment: AlignmentType.LEFT, spacing: { after: 60 } })
    );
  }

  if (cvData.personalInfo?.phone) {
    sections.push(
      styledParagraph(`${labels.phone}: ${cvData.personalInfo.phone}`,
        { size: 20, color: COLORS.text },
        { alignment: AlignmentType.LEFT, spacing: { after: 60 } })
    );
  }

  if (cvData.personalInfo?.address) {
    sections.push(
      styledParagraph(`${labels.address}: ${cvData.personalInfo.address}`,
        { size: 20, color: COLORS.text },
        { alignment: AlignmentType.LEFT, spacing: { after: 60 } })
    );
  }

  if (cvData.personalInfo?.linkedIn) {
    sections.push(
      styledParagraph(`LinkedIn: ${cvData.personalInfo.linkedIn}`,
        { size: 20, color: COLORS.text },
        { alignment: AlignmentType.LEFT, spacing: { after: 300 } })
    );
  }

  // Professional Summary
  if (cvData.professionalSummary) {
    sections.push(
      createSectionHeading(labels.professionalSummary),
      new Paragraph({
        text: cvData.professionalSummary,
        spacing: { after: 300 }
      })
    );
  }

  // Work Experience
  if (cvData.workExperience?.length > 0) {
    sections.push(createSectionHeading(labels.workExperience));

    cvData.workExperience.forEach(exp => {
      // Position and company
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: exp.position || '', bold: true, size: 24 }),
            ...(exp.company ? [new TextRun({ text: ` - ${exp.company}`, size: 24 })] : [])
          ],
          spacing: { before: 200, after: 100 }
        })
      );

      // Date range
      const expDates = dateRange(exp, labels.present);
      if (expDates) {
        sections.push(
          styledParagraph(expDates, { italics: true, color: COLORS.secondary }, { spacing: { after: 100 } })
        );
      }

      // Location
      if (exp.location) {
        sections.push(
          styledParagraph(exp.location, { italics: true, color: COLORS.secondary }, { spacing: { after: 100 } })
        );
      }

      // Responsibilities
      if (exp.responsibilities?.length > 0) {
        exp.responsibilities.forEach(resp => {
          sections.push(
            new Paragraph({
              text: `• ${resp}`,
              spacing: { before: 50 }
            })
          );
        });
      }

      // Achievements
      if (exp.achievements?.length > 0) {
        sections.push(
          styledParagraph(labels.achievements + ':', { bold: true }, { spacing: { before: 100 } })
        );
        exp.achievements.forEach(achievement => {
          sections.push(
            styledParagraph(`✓ ${achievement}`, { color: COLORS.accent }, { spacing: { before: 50 } })
          );
        });
      }
    });
  }

  // Education
  if (cvData.education?.length > 0) {
    sections.push(createSectionHeading(labels.education));

    cvData.education.forEach(edu => {
      // Degree and field
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: edu.degree || '', bold: true, size: 24 }),
            // Guarded like the PDF renderer: no dangling "Bachelor - ".
            ...(edu.fieldOfStudy ? [new TextRun({ text: ` - ${edu.fieldOfStudy}`, size: 24 })] : [])
          ],
          spacing: { before: 200, after: 100 }
        })
      );

      // Institution
      if (edu.institution) {
        sections.push(
          new Paragraph({
            text: edu.institution,
            spacing: { after: 50 }
          })
        );
      }

      // Date range
      const eduDates = dateRange(edu, labels.present);
      if (eduDates) {
        sections.push(
          styledParagraph(eduDates, { italics: true, color: COLORS.secondary }, { spacing: { after: 50 } })
        );
      }

      // GPA and honors
      if (edu.gpa || edu.honors) {
        const extras = [];
        if (edu.gpa) extras.push(`${labels.gpa}: ${edu.gpa}`);
        if (edu.honors) extras.push(edu.honors);
        sections.push(
          styledParagraph(extras.join(' | '), { color: COLORS.secondary }, { spacing: { after: 200 } })
        );
      }
    });
  }

  // Skills
  if (cvData.skills?.technical?.length > 0 || cvData.skills?.soft?.length > 0 || cvData.skills?.tools?.length > 0) {
    sections.push(createSectionHeading(labels.skills));

    if (cvData.skills.technical?.length > 0) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: labels.technicalSkills + ': ', bold: true }),
            new TextRun({ text: cvData.skills.technical.join(', ') })
          ],
          spacing: { after: 100 }
        })
      );
    }

    if (cvData.skills.soft?.length > 0) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: labels.softSkills + ': ', bold: true }),
            new TextRun({ text: cvData.skills.soft.join(', ') })
          ],
          spacing: { after: 100 }
        })
      );
    }

    if (cvData.skills.tools?.length > 0) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: labels.tools + ': ', bold: true }),
            new TextRun({ text: cvData.skills.tools.join(', ') })
          ],
          spacing: { after: 200 }
        })
      );
    }
  }

  // Languages
  if (cvData.languages?.length > 0) {
    sections.push(createSectionHeading(labels.languages));
    cvData.languages.forEach(lang => {
      sections.push(
        new Paragraph({
          text: `${lang.name}: ${lang.proficiency}`,
          spacing: { after: 100 }
        })
      );
    });
  }

  // Certifications
  if (cvData.certifications?.length > 0) {
    sections.push(createSectionHeading(labels.certifications));
    cvData.certifications.forEach(cert => {
      const certText = cert.issuer
        ? `${cert.name} - ${cert.issuer}${cert.dateObtained ? ` (${cert.dateObtained})` : ''}`
        : cert.name;
      sections.push(
        new Paragraph({
          text: certText,
          spacing: { after: 100 }
        })
      );
    });
  }

  // References
  if (cvData.references?.length > 0) {
    sections.push(createSectionHeading(labels.references));
    cvData.references.forEach(ref => {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: ref.name, bold: true })
          ],
          spacing: { before: 100 }
        })
      );
      if (ref.position && ref.company) {
        sections.push(
          new Paragraph({
            text: `${ref.position} - ${ref.company}`
          })
        );
      }
      if (ref.email || ref.phone) {
        const contact = [ref.email, ref.phone].filter(Boolean).join(' | ');
        sections.push(
          styledParagraph(contact, { color: COLORS.secondary }, { spacing: { after: 100 } })
        );
      }
    });
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.75),
            right: convertInchesToTwip(0.75),
            bottom: convertInchesToTwip(0.75),
            left: convertInchesToTwip(0.75)
          }
        }
      },
      children: sections
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

/**
 * Create a styled section heading
 * @param {string} text - The heading text
 * @returns {Paragraph}
 */
function createSectionHeading(text) {
  return styledParagraph(text,
    { color: COLORS.primary, bold: true, size: 28 },
    { heading: HeadingLevel.HEADING_2, thematicBreak: true, spacing: { before: 400, after: 200 } });
}

// Albanian labels
const LABELS_SQ = {
  cvTitle: 'CURRICULUM VITAE',
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
  gpa: 'Nota Mesatare'
};

// English labels
const LABELS_EN = {
  cvTitle: 'CURRICULUM VITAE',
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
  gpa: 'GPA'
};
