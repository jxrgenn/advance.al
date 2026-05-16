// Generate a `.docx` payment-receipt document, attached to the receipt
// email by routes/payments.js after a successful Paysera callback or
// dev fake-success. Returns a Buffer ready for Resend's `attachments`
// field. Reuses the existing `docx` dependency (already used by
// cvDocumentService.js) — no new npm deps.
//
// Albanian content; minimal layout: header band, employer + payment
// metadata, single-line "thank you" footer. NOT a tax-compliant
// invoice with VAT line items — that's a separate (still-deferred)
// compliance task. This is "evidence of receipt" only.

import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, convertInchesToTwip } from 'docx';

const COLORS = {
  primary: '#16a34a',  // green — matches the receipt-email accent
  text: '#1e293b',
  muted: '#64748b',
  divider: '#d1d5db',
};

function tierLabel(tier) {
  if (tier === 'promoted') return 'I Promovuar';
  if (tier === 'standard') return 'Standart';
  return tier || 'Standart';
}

function fmtAmount(eur) {
  return `€${Number(eur || 0).toFixed(2)}`;
}

function fmtDate(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  return d.toLocaleDateString('sq-AL', { year: 'numeric', month: 'long', day: 'numeric' });
}

function row(label, value) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: `${label}: `, color: COLORS.muted, size: 22 }),
      new TextRun({ text: String(value || ''), color: COLORS.text, size: 22, bold: true }),
    ],
  });
}

/**
 * @param {Object} opts
 * @param {string} opts.employerName    Albanian display name for the recipient
 * @param {string} opts.jobTitle        Job title being paid for
 * @param {number} opts.amountEur       Decimal EUR amount
 * @param {Date|string} opts.paymentDate When the callback marked it paid
 * @param {string} opts.paymentId       Paysera requestid (or dev-fake-... / admin-...)
 * @param {string} opts.tier            'standard' | 'promoted'
 * @returns {Promise<Buffer>}
 */
export async function generatePaymentReceiptDocx({ employerName, jobTitle, amountEur, paymentDate, paymentId, tier }) {
  const sections = [];

  // Header brand
  sections.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [
      new TextRun({ text: 'advance.al', bold: true, size: 40, color: COLORS.primary }),
    ],
  }));

  sections.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [
      new TextRun({ text: 'Konfirmim pagese', size: 22, color: COLORS.muted }),
    ],
  }));

  // Body intro
  sections.push(new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({ text: `Përshëndetje ${employerName || 'Punëdhënës'},`, size: 24 }),
    ],
  }));

  sections.push(new Paragraph({
    spacing: { after: 240 },
    children: [
      new TextRun({
        text: 'Faleminderit për pagesën. Puna juaj është publikuar dhe është tashmë e dukshme për kandidatët.',
        size: 22,
        color: COLORS.text,
      }),
    ],
  }));

  // Receipt details
  sections.push(new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [
      new TextRun({ text: 'Detajet e faturës', bold: true, size: 26, color: COLORS.primary }),
    ],
  }));

  sections.push(row('Titulli i punës', jobTitle || '—'));
  sections.push(row('Paketa', tierLabel(tier)));
  sections.push(row('Data e pagesës', fmtDate(paymentDate)));
  sections.push(row('ID e transaksionit', paymentId || '—'));

  // Total — emphasised
  sections.push(new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({ text: 'Totali: ', size: 26, color: COLORS.muted }),
      new TextRun({ text: fmtAmount(amountEur), size: 32, bold: true, color: COLORS.primary }),
    ],
  }));

  // Footer
  sections.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    children: [
      new TextRun({
        text: 'Ruajeni këtë faturë si dëshmi pagese. Për pyetje rreth pagesës, na kontaktoni në support@advance.al.',
        size: 18,
        color: COLORS.muted,
        italics: true,
      }),
    ],
  }));

  sections.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200 },
    children: [
      new TextRun({
        text: `© ${new Date().getFullYear()} advance.al — Platforma e Punës në Shqipëri`,
        size: 16,
        color: COLORS.muted,
      }),
    ],
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.75),
            right: convertInchesToTwip(0.75),
            bottom: convertInchesToTwip(0.75),
            left: convertInchesToTwip(0.75),
          },
        },
      },
      children: sections,
    }],
  });

  return await Packer.toBuffer(doc);
}

export default { generatePaymentReceiptDocx };
