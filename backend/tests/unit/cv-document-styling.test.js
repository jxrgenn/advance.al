/**
 * #65 — the generated Word CV puts its formatting on the TEXT RUNS.
 *
 * In docx v9, `new Paragraph({ text, run: {...} })` styles only the paragraph
 * mark and `bold`/`italics` are not Paragraph options, so Word rendered the
 * name, title, dates and "Arritje:" in the plain body style. Also: an empty
 * company / field of study left a dangling " - ".
 *
 * Reads word/document.xml of the real generated file.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import JSZip from 'jszip';
import { generateCVDocument } from '../../src/services/cvDocumentService.js';

const CV = {
  personalInfo: { fullName: 'Arbër Hoxha', email: 'arber@example.com', phone: '+355691234567' },
  professionalSummary: 'Zhvillues software.',
  workExperience: [
    { position: 'Developer', company: '', startDate: '01.2020', endDate: '', current: true, location: 'Tiranë', responsibilities: ['Ndërtoi aplikacione'], achievements: ['Dorëzoi platformën'] },
    { position: 'Praktikant', company: 'Acme', startDate: '06.2018', endDate: '12.2019', current: false, location: '', responsibilities: [], achievements: [] },
  ],
  education: [{ degree: 'Bachelor', fieldOfStudy: '', institution: 'UT', startDate: '', endDate: '2018', current: false, gpa: '', honors: '' }],
  skills: { technical: ['React'], soft: [], tools: [] },
};

/** The <w:p> element containing `text`, with its paragraph properties dropped. */
function paragraphOf(xml, text) {
  const i = xml.indexOf(`>${text}<`);
  if (i < 0) return null;
  const start = xml.lastIndexOf('<w:p>', i);
  const end = xml.indexOf('</w:p>', i);
  return xml.slice(start, end + 6).replace(/<w:pPr>.*?<\/w:pPr>/, '');
}
/** The run properties of the run holding `text`. */
function runPropsOf(xml, text) {
  const p = paragraphOf(xml, text);
  const m = p && p.match(/<w:r><w:rPr>(.*?)<\/w:rPr><w:t[^>]*>([^<]*)<\/w:t><\/w:r>/);
  return m && m[2] === text ? m[1] : null;
}

describe('#65 Word CV formatting lives on the text runs', () => {
  let xml;
  beforeAll(async () => {
    const buf = await generateCVDocument(CV, 'sq');
    xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
  });

  it('name: bold, dark blue (no "#"), 18pt', () => {
    expect(runPropsOf(xml, 'Arbër Hoxha')).toBe('<w:b/><w:bCs/><w:color w:val="1e3a8a"/><w:sz w:val="36"/><w:szCs w:val="36"/>');
  });

  it('dates: italic slate-gray; a current job reads "start - Aktualisht"', () => {
    expect(runPropsOf(xml, '01.2020 - Aktualisht')).toBe('<w:i/><w:iCs/><w:color w:val="64748b"/>');
    expect(runPropsOf(xml, '06.2018 - 12.2019')).toBe('<w:i/><w:iCs/><w:color w:val="64748b"/>');
  });

  it('"Arritje:" is bold and achievements are coloured', () => {
    expect(runPropsOf(xml, 'Arritje:')).toBe('<w:b/><w:bCs/>');
    expect(runPropsOf(xml, '✓ Dorëzoi platformën')).toBe('<w:color w:val="0ea5e9"/>');
  });

  it('section headings carry colour/bold/size on the run', () => {
    expect(runPropsOf(xml, 'Eksperienca Profesionale')).toBe('<w:b/><w:bCs/><w:color w:val="1e3a8a"/><w:sz w:val="28"/><w:szCs w:val="28"/>');
  });

  it('no paragraph-mark-only formatting is left (every rPr belongs to a run, none to pPr)', () => {
    expect(xml).not.toMatch(/<w:pPr>(?:(?!<\/w:pPr>).)*<w:rPr>/);
  });

  it('empty company / field of study → no dangling " - "; a lone end date prints alone', () => {
    expect(xml).not.toContain('<w:t xml:space="preserve"> - </w:t>');
    expect(paragraphOf(xml, 'Developer')).not.toContain(' - ');
    expect(paragraphOf(xml, 'Bachelor')).not.toContain(' - ');
    expect(runPropsOf(xml, '2018')).toBe('<w:i/><w:iCs/><w:color w:val="64748b"/>');
    // a filled company is still joined
    expect(xml).toContain('<w:t xml:space="preserve"> - Acme</w:t>');
  });
});
