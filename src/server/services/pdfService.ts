import PDFDocument from 'pdfkit';
import type { Response } from 'express';

export interface StoryPdfInput {
  universe: string;
  saga: string;
  arc: string;
  volume: string;
  chapterNumber: number;
  chapterTitle: string;
  sceneNumber: number;
  status: string;
  revisionNumber: number;
  scriptText: string;
  dialogueNotes?: string | null;
  continuityNotes?: string | null;
  linkedItems?: Array<{ title: string; departmentId: string; moduleKey: string }>;
}

export function streamStoryPdf(res: Response, story: StoryPdfInput) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 56, left: 60, right: 60 },
    info: {
      Title: `Elder'sVeil Script - ${story.chapterTitle}`,
      Author: "Elder'sVeil Anime Studio — Story / Writing Department",
      Creator: "Elder'sVeil Anime Studio Ecosystem",
    },
  });

  const safeFilename = story.chapterTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'story';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="EldersVeil_${safeFilename}_Ch${story.chapterNumber}.pdf"`);

  doc.pipe(res);

  // Header Crest & Hierarchy
  doc
    .fontSize(9)
    .fillColor('#9A6B2F')
    .text("ELDER'SVEIL ANIME STUDIO  |  STORIES BEYOND IMAGINATION", { align: 'left' });
  doc.moveDown(0.3);
  doc
    .fontSize(20)
    .fillColor('#111827')
    .text(story.chapterTitle, { align: 'left' });
  doc.moveDown(0.3);

  doc
    .fontSize(10)
    .fillColor('#4B5563')
    .text(
      `${story.universe}  >  ${story.saga}  >  ${story.arc}  >  ${story.volume}  >  Chapter ${story.chapterNumber}  >  Scene ${story.sceneNumber}`
    );
  doc
    .fontSize(9)
    .fillColor('#6B7280')
    .text(`Status: ${story.status}   |   Revision: v${story.revisionNumber}   |   Generated: ${new Date().toISOString().slice(0, 10)}`);

  doc.moveDown(0.8);
  doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor('#D1D5DB').lineWidth(0.75).stroke();
  doc.moveDown(1);

  // Main Script Body
  doc.fontSize(12).fillColor('#111827').text('SCREENPLAY & MANUSCRIPT', { underline: false });
  doc.moveDown(0.5);
  doc.fontSize(10.5).fillColor('#1F2937').text(story.scriptText, {
    lineGap: 4,
    align: 'left',
  });

  if (story.dialogueNotes) {
    doc.moveDown(1.2);
    doc.fontSize(11).fillColor('#9A6B2F').text('DIALOGUE & VOICE DIRECTION NOTES');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#374151').text(story.dialogueNotes, { lineGap: 3 });
  }

  if (story.continuityNotes) {
    doc.moveDown(1.2);
    doc.fontSize(11).fillColor('#9A6B2F').text('CONTINUITY & LORE GUARDRAILS');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#374151').text(story.continuityNotes, { lineGap: 3 });
  }

  if (story.linkedItems && story.linkedItems.length > 0) {
    doc.moveDown(1.2);
    doc.fontSize(11).fillColor('#9A6B2F').text('LINKED CROSS-DEPARTMENT PRODUCTION ASSETS');
    doc.moveDown(0.3);
    for (const item of story.linkedItems) {
      doc
        .fontSize(9.5)
        .fillColor('#374151')
        .text(`• [${item.departmentId.toUpperCase()}] ${item.title} (${item.moduleKey})`);
    }
  }

  doc.moveDown(2);
  doc
    .fontSize(8)
    .fillColor('#9CA3AF')
    .text("Confidential Production Document — Elder'sVeil Anime Studio (Founder & Director: M.J. Mujesh Dharshan)", {
      align: 'center',
    });

  doc.end();
}
