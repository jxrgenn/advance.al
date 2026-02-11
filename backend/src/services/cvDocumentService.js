import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, convertInchesToTwip } from 'docx';

const COLORS = {
  primary: '#1e3a8a', // Dark blue
  secondary: '#64748b', // Slate gray
  accent: '#0ea5e9', // Sky blue
  text: '#1e293b' // Dark slate
};

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
    new Paragraph({
      text: cvData.personalInfo?.fullName || labels.yourName,
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
      run: {
        color: COLORS.primary,
        size: 36,
        bold: true
      }
    })
  );

  // Professional Title if available - LEFT ALIGNED
  if (cvData.personalInfo?.title) {
    sections.push(
      new Paragraph({
        text: cvData.personalInfo.title,
        alignment: AlignmentType.LEFT,
        spacing: { after: 200 },
        run: {
          size: 24,
          color: COLORS.accent,
          bold: true
        }
      })
    );
  }

  // Contact Information - LEFT ALIGNED, ONE PER LINE
  if (cvData.personalInfo?.email) {
    sections.push(
      new Paragraph({
        text: `${labels.email}: ${cvData.personalInfo.email}`,
        alignment: AlignmentType.LEFT,
        spacing: { after: 60 },
        run: {
          size: 20,
          color: COLORS.text
        }
      })
    );
  }

  if (cvData.personalInfo?.phone) {
    sections.push(
      new Paragraph({
        text: `${labels.phone}: ${cvData.personalInfo.phone}`,
        alignment: AlignmentType.LEFT,
        spacing: { after: 60 },
        run: {
          size: 20,
          color: COLORS.text
        }
      })
    );
  }

  if (cvData.personalInfo?.address) {
    sections.push(
      new Paragraph({
        text: `${labels.address}: ${cvData.personalInfo.address}`,
        alignment: AlignmentType.LEFT,
        spacing: { after: 60 },
        run: {
          size: 20,
          color: COLORS.text
        }
      })
    );
  }

  if (cvData.personalInfo?.linkedIn) {
    sections.push(
      new Paragraph({
        text: `LinkedIn: ${cvData.personalInfo.linkedIn}`,
        alignment: AlignmentType.LEFT,
        spacing: { after: 300 },
        run: {
          size: 20,
          color: COLORS.text
        }
      })
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
            new TextRun({ text: exp.position, bold: true, size: 24 }),
            new TextRun({ text: ` - ${exp.company}`, size: 24 })
          ],
          spacing: { before: 200, after: 100 }
        })
      );

      // Date range
      const dateRange = exp.current
        ? `${exp.startDate} - ${labels.present}`
        : `${exp.startDate} - ${exp.endDate || ''}`;

      sections.push(
        new Paragraph({
          text: dateRange,
          italics: true,
          spacing: { after: 100 },
          run: {
            color: COLORS.secondary
          }
        })
      );

      // Location
      if (exp.location) {
        sections.push(
          new Paragraph({
            text: exp.location,
            spacing: { after: 100 },
            run: {
              color: COLORS.secondary,
              italics: true
            }
          })
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
          new Paragraph({
            text: labels.achievements + ':',
            bold: true,
            spacing: { before: 100 }
          })
        );
        exp.achievements.forEach(achievement => {
          sections.push(
            new Paragraph({
              text: `✓ ${achievement}`,
              spacing: { before: 50 },
              run: {
                color: COLORS.accent
              }
            })
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
            new TextRun({ text: edu.degree, bold: true, size: 24 }),
            new TextRun({ text: ` - ${edu.fieldOfStudy}`, size: 24 })
          ],
          spacing: { before: 200, after: 100 }
        })
      );

      // Institution
      sections.push(
        new Paragraph({
          text: edu.institution,
          spacing: { after: 50 }
        })
      );

      // Date range
      const eduDateRange = edu.current
        ? `${edu.startDate} - ${labels.present}`
        : `${edu.startDate} - ${edu.endDate || ''}`;

      sections.push(
        new Paragraph({
          text: eduDateRange,
          italics: true,
          spacing: { after: 50 },
          run: {
            color: COLORS.secondary
          }
        })
      );

      // GPA and honors
      if (edu.gpa || edu.honors) {
        const extras = [];
        if (edu.gpa) extras.push(`${labels.gpa}: ${edu.gpa}`);
        if (edu.honors) extras.push(edu.honors);
        sections.push(
          new Paragraph({
            text: extras.join(' | '),
            spacing: { after: 200 },
            run: {
              color: COLORS.secondary
            }
          })
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
          new Paragraph({
            text: contact,
            spacing: { after: 100 },
            run: {
              color: COLORS.secondary
            }
          })
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
  console.log(`✅ CV document generated successfully (${buffer.length} bytes)`);
  return buffer;
}

/**
 * Create a styled section heading
 * @param {string} text - The heading text
 * @returns {Paragraph}
 */
function createSectionHeading(text) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_2,
    thematicBreak: true,
    spacing: { before: 400, after: 200 },
    run: {
      color: COLORS.primary,
      bold: true,
      size: 28
    }
  });
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
