import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Project, Note, Section } from '../types';

// ===========================
// SHARED UTILITIES
// ===========================

interface PDFContext {
  pdf: jsPDF;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  lineHeight: number;
  yPosition: number;
}

const createPDFContext = (): PDFContext => {
  const pdf = new jsPDF();
  return {
    pdf,
    pageWidth: pdf.internal.pageSize.getWidth(),
    pageHeight: pdf.internal.pageSize.getHeight(),
    margin: 20,
    lineHeight: 10,
    yPosition: 20,
  };
};

const checkPageBreak = (ctx: PDFContext, requiredSpace: number = 20): void => {
  if (ctx.yPosition > ctx.pageHeight - requiredSpace) {
    ctx.pdf.addPage();
    ctx.yPosition = ctx.margin;
  }
};

const addWrappedText = (ctx: PDFContext, text: string, maxWidth?: number): void => {
  const width = maxWidth || (ctx.pageWidth - 2 * ctx.margin);
  const lines = ctx.pdf.splitTextToSize(text, width);

  lines.forEach((line: string) => {
    checkPageBreak(ctx);
    ctx.pdf.text(line, ctx.margin, ctx.yPosition);
    ctx.yPosition += ctx.lineHeight;
  });
};

const finalizePDF = (ctx: PDFContext, fileName: string): { pdfBuffer: string; fileName: string } => {
  const pdfBuffer = ctx.pdf.output('datauristring').split(',')[1];
  return { pdfBuffer, fileName };
};

// ===========================
// INSPEKTIONSRAPPORT TEMPLATE
// ===========================

const formatSwedishDate = (date: Date): string => {
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

const addBoldLabel = (ctx: PDFContext, label: string, value: string, x: number, y: number): void => {
  ctx.pdf.setFont('helvetica', 'bold');
  ctx.pdf.text(`${label}:`, x, y);

  const labelWidth = ctx.pdf.getTextWidth(`${label}: `);
  ctx.pdf.setFont('helvetica', 'normal');
  ctx.pdf.text(value, x + labelWidth, y);
};

const groupNotesByDelomrade = (notes: Note[]): Map<string, Note[]> => {
  const grouped = new Map<string, Note[]>();

  notes.forEach(note => {
    const delomrade = note.delomrade || 'Ej angiven';
    if (!grouped.has(delomrade)) {
      grouped.set(delomrade, []);
    }
    grouped.get(delomrade)!.push(note);
  });

  return grouped;
};

const fetchImageAsDataURL = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to fetch image:', error);
    return null;
  }
};

export const generateProjectPDF = async (project: Project): Promise<{ pdfBuffer: string; fileName: string }> => {
  console.log('=== INSPEKTIONSRAPPORT PDF GENERATION START ===');
  console.log('Project data:', {
    name: project.name,
    notesCount: project.notes?.length || 0,
  });

  const ctx = createPDFContext();

  // 1. Title - Centered, bold, large font
  ctx.pdf.setFontSize(22);
  ctx.pdf.setFont('helvetica', 'bold');
  const title = 'Inspektionsrapport';
  const titleWidth = ctx.pdf.getTextWidth(title);
  const titleX = (ctx.pageWidth - titleWidth) / 2;
  ctx.pdf.text(title, titleX, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 2.5;

  // 2. Project Information Block
  ctx.pdf.setFontSize(11);
  const inspectionDate = project.date ? new Date(project.date) : new Date();

  addBoldLabel(ctx, 'Namn på projekt', project.name, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 1.3;

  addBoldLabel(ctx, 'Adress', project.location || 'Ej angiven', ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 1.3;

  addBoldLabel(ctx, 'Datum för inspektion', formatSwedishDate(inspectionDate), ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 1.3;

  addBoldLabel(ctx, 'Inspektör', project.inspector || 'Ej angiven', ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 3;

  // 3. Section Header: "Inspektionsanteckningar"
  if (project.notes && project.notes.length > 0) {
    checkPageBreak(ctx, 60);

    ctx.pdf.setFontSize(16);
    ctx.pdf.setFont('helvetica', 'bold');
    ctx.pdf.text('Inspektionsanteckningar', ctx.margin, ctx.yPosition);

    const lineY = ctx.yPosition + 2;
    ctx.pdf.setLineWidth(0.5);
    ctx.pdf.line(ctx.margin, lineY, ctx.margin + ctx.pdf.getTextWidth('Inspektionsanteckningar'), lineY);

    ctx.yPosition += ctx.lineHeight * 2;

    // 4. Notes Table
    const colDelomradeX = ctx.margin;
    const colKommentarX = ctx.margin + 60;
    const colBildX = ctx.margin + 155;

    const colDelomradeWidth = 55;
    const colKommentarWidth = 95;
    const colBildWidth = 40;

    const tableWidth = colDelomradeWidth + colKommentarWidth + colBildWidth;

    // Table Header
    const headerY = ctx.yPosition;
    ctx.pdf.setFontSize(10);
    ctx.pdf.setFont('helvetica', 'bold');

    ctx.pdf.rect(colDelomradeX, headerY, colDelomradeWidth, 8);
    ctx.pdf.rect(colKommentarX, headerY, colKommentarWidth, 8);
    ctx.pdf.rect(colBildX, headerY, colBildWidth, 8);
    ctx.pdf.stroke();

    ctx.pdf.text('Delområde', colDelomradeX + 2, headerY + 6);
    ctx.pdf.text('Kommentar', colKommentarX + 2, headerY + 6);
    ctx.pdf.text('Bild', colBildX + 2, headerY + 6);

    ctx.yPosition = headerY + 8;

    // Group notes by delområde
    const groupedNotes = groupNotesByDelomrade(project.notes);

    ctx.pdf.setFont('helvetica', 'normal');
    ctx.pdf.setFontSize(9);

    for (const [delomrade, notes] of groupedNotes) {
      for (const note of notes) {
        checkPageBreak(ctx, 30);

        const rowY = ctx.yPosition;

        let kommentar = note.kommentar || '';
        if (!kommentar && note.transcription) {
          kommentar = note.transcription;
        } else if (!kommentar && note.imageLabel) {
          kommentar = note.imageLabel;
        }

        const kommentarLines = ctx.pdf.splitTextToSize(kommentar || 'Ingen kommentar', colKommentarWidth - 4);
        const textHeight = kommentarLines.length * 4;
        const rowHeight = Math.max(textHeight + 4, 20);

        ctx.pdf.rect(colDelomradeX, rowY, colDelomradeWidth, rowHeight);
        ctx.pdf.rect(colKommentarX, rowY, colKommentarWidth, rowHeight);
        ctx.pdf.rect(colBildX, rowY, colBildWidth, rowHeight);
        ctx.pdf.stroke();

        ctx.pdf.text(delomrade, colDelomradeX + 2, rowY + 5, {
          maxWidth: colDelomradeWidth - 4
        });

        let currentY = rowY + 5;
        kommentarLines.forEach((line: string) => {
          ctx.pdf.text(line, colKommentarX + 2, currentY);
          currentY += 4;
        });

        if (note.type === 'photo' && note.mediaUrl) {
          try {
            const imageData = await fetchImageAsDataURL(note.mediaUrl);
            if (imageData) {
              const imgWidth = 35;
              const imgHeight = 15;
              const imgX = colBildX + 2;
              const imgY = rowY + 2;

              ctx.pdf.addImage(imageData, 'JPEG', imgX, imgY, imgWidth, imgHeight);
            }
          } catch (error) {
            console.error('Failed to add image to PDF:', error);
          }
        }

        ctx.yPosition = rowY + rowHeight;
      }
    }
  } else {
    ctx.pdf.setFontSize(10);
    ctx.pdf.setFont('helvetica', 'italic');
    ctx.pdf.text('Inga inspektionsanteckningar registrerade.', ctx.margin, ctx.yPosition);
  }

  const fileName = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_inspektionsrapport.pdf`;

  console.log('=== INSPEKTIONSRAPPORT PDF GENERATION COMPLETE ===');
  console.log('Generated file:', fileName);

  return finalizePDF(ctx, fileName);
};

// ===========================
// BESIKTNINGSPROTOKOLL TEMPLATE
// ===========================

interface SectionWithData extends Section {
  fields?: Record<string, string>;
  notes?: Note[];
  subsections?: SectionWithData[];
}

interface ProjectWithSections extends Project {
  sections?: SectionWithData[];
  sectionFields?: Record<string, Record<string, string>>;
}

export const generateBesiktningsprotokollPDF = async (project: ProjectWithSections): Promise<{ pdfBuffer: string; fileName: string }> => {
  console.log('=== BESIKTNINGSPROTOKOLL PDF GENERATION START ===');
  console.log('Project data:', {
    name: project.name,
    location: project.location,
    sectionsCount: project.sections?.length || 0,
    notesCount: project.notes?.length || 0
  });

  const ctx = createPDFContext();

  // Title
  ctx.pdf.setFontSize(20);
  ctx.pdf.setFont('helvetica', 'bold');
  ctx.pdf.text('Besiktningsprotokoll', ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 2;

  // Project Information
  ctx.pdf.setFontSize(14);
  ctx.pdf.setFont('helvetica', 'bold');
  ctx.pdf.text('Projektinformation', ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 1.5;

  ctx.pdf.setFontSize(12);
  ctx.pdf.setFont('helvetica', 'normal');
  ctx.pdf.text(`Projekt: ${project.name}`, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight;
  ctx.pdf.text(`Adress: ${project.location || 'Ej specificerad'}`, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight;
  ctx.pdf.text(`Datum: ${project.date ? new Date(project.date).toLocaleDateString('sv-SE') : 'Ej specificerat'}`, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight;
  ctx.pdf.text(`Besiktningsman: ${project.inspector || 'Ej specificerat'}`, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 2;

  // Section field groups
  const sectionFieldGroups = [
    'Fastighetsuppgifter',
    'Besiktningsuppgifter',
    'Byggnadsbeskrivning',
    'Besiktningsutlåtande'
  ];

  // Add each section field group
  if (project.sections) {
    for (const sectionName of sectionFieldGroups) {
      const section = project.sections.find(s => s.name === sectionName);
      if (section) {
        await addSectionFields(ctx, section, project.sectionFields?.[section.id]);
      }
    }
  }

  // Delområden with notes
  checkPageBreak(ctx, 40);
  ctx.pdf.setFontSize(14);
  ctx.pdf.setFont('helvetica', 'bold');
  ctx.pdf.text('Besiktningsresultat', ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 1.5;

  // Main sections that contain delområden
  const mainSectionNames = ['Utvändigt', 'Entréplan', 'Övre plan', 'Källarplan'];

  if (project.sections) {
    for (const sectionName of mainSectionNames) {
      const mainSection = project.sections.find(s => s.name === sectionName);
      if (mainSection) {
        await addMainSectionWithSubsections(ctx, mainSection, project.notes || []);
      }
    }
  }

  const fileName = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_besiktningsprotokoll.pdf`;

  console.log('=== BESIKTNINGSPROTOKOLL PDF GENERATION COMPLETE ===');
  console.log('Generated file:', fileName);

  return finalizePDF(ctx, fileName);
};

const addSectionFields = async (
  ctx: PDFContext,
  section: SectionWithData,
  fields?: Record<string, string>
): Promise<void> => {
  checkPageBreak(ctx, 30);

  ctx.pdf.setFontSize(12);
  ctx.pdf.setFont('helvetica', 'bold');
  ctx.pdf.text(section.name, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 1.2;

  ctx.pdf.setFontSize(10);
  ctx.pdf.setFont('helvetica', 'normal');

  if (fields && Object.keys(fields).length > 0) {
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      if (fieldValue && fieldValue.trim()) {
        checkPageBreak(ctx);

        // Format field name (convert snake_case to readable)
        const formattedFieldName = fieldName
          .replace(/_/g, ' ')
          .replace(/\b\w/g, char => char.toUpperCase());

        ctx.pdf.setFont('helvetica', 'bold');
        ctx.pdf.text(`${formattedFieldName}:`, ctx.margin + 5, ctx.yPosition);
        ctx.yPosition += ctx.lineHeight;

        ctx.pdf.setFont('helvetica', 'normal');
        addWrappedText(ctx, fieldValue);
        ctx.yPosition += ctx.lineHeight * 0.3;
      }
    }
  } else {
    ctx.pdf.setFont('helvetica', 'italic');
    ctx.pdf.text('Inga uppgifter angivna', ctx.margin + 5, ctx.yPosition);
    ctx.yPosition += ctx.lineHeight;
  }

  ctx.yPosition += ctx.lineHeight;
};

const addMainSectionWithSubsections = async (
  ctx: PDFContext,
  mainSection: SectionWithData,
  allNotes: Note[]
): Promise<void> => {
  checkPageBreak(ctx, 30);

  // Main section header
  ctx.pdf.setFontSize(12);
  ctx.pdf.setFont('helvetica', 'bold');
  ctx.pdf.text(mainSection.name, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 1.2;

  // Notes directly on main section
  const mainSectionNotes = allNotes.filter(note =>
    note.section_id === mainSection.id && !note.subsection_id
  );

  if (mainSectionNotes.length > 0) {
    await addNotesToPDF(ctx, mainSectionNotes, ctx.margin + 5);
  }

  // Subsections (delområden)
  if (mainSection.subsections && mainSection.subsections.length > 0) {
    for (const subsection of mainSection.subsections) {
      await addSubsection(ctx, subsection, allNotes);
    }
  }

  ctx.yPosition += ctx.lineHeight;
};

const addSubsection = async (
  ctx: PDFContext,
  subsection: SectionWithData,
  allNotes: Note[]
): Promise<void> => {
  checkPageBreak(ctx, 20);

  // Subsection header
  ctx.pdf.setFontSize(11);
  ctx.pdf.setFont('helvetica', 'bold');
  ctx.pdf.text(`  ${subsection.name}`, ctx.margin + 5, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight;

  // Notes in subsection
  const subsectionNotes = allNotes.filter(note =>
    note.subsection_id === subsection.id
  );

  if (subsectionNotes.length > 0) {
    await addNotesToPDF(ctx, subsectionNotes, ctx.margin + 10);
  } else {
    ctx.pdf.setFontSize(10);
    ctx.pdf.setFont('helvetica', 'italic');
    ctx.pdf.text('Inga anmärkningar', ctx.margin + 10, ctx.yPosition);
    ctx.yPosition += ctx.lineHeight;
  }

  ctx.yPosition += ctx.lineHeight * 0.5;
};

const addNotesToPDF = async (
  ctx: PDFContext,
  notes: Note[],
  indent: number
): Promise<void> => {
  ctx.pdf.setFontSize(10);
  ctx.pdf.setFont('helvetica', 'normal');

  notes.forEach((note, index) => {
    checkPageBreak(ctx);

    let noteContent = note.kommentar || '';
    if (note.type === 'text' && !noteContent && note.transcription) {
      noteContent = note.transcription;
    } else if (note.type === 'photo' && note.imageLabel) {
      noteContent = note.imageLabel;
    } else if (note.type === 'video' && note.transcription) {
      noteContent = note.transcription;
    }

    const noteType = note.type === 'photo' ? '📷' : note.type === 'video' ? '🎥' : '📝';
    const noteText = `${noteType} ${noteContent}`;

    const lines = ctx.pdf.splitTextToSize(noteText, ctx.pageWidth - indent - ctx.margin);
    lines.forEach((line: string) => {
      checkPageBreak(ctx);
      ctx.pdf.text(line, indent, ctx.yPosition);
      ctx.yPosition += ctx.lineHeight;
    });

    ctx.yPosition += ctx.lineHeight * 0.3;
  });
};

// ===========================
// LEGACY EXPORT (UNUSED)
// ===========================

export const exportProjectToPDF = async (project: Project): Promise<void> => {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const lineHeight = 10;
  let yPosition = margin;

  // Title
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Inspektionsrapport', margin, yPosition);
  yPosition += lineHeight * 2;

  // Project Info
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Projekt: ${project.name}`, margin, yPosition);
  yPosition += lineHeight;
  pdf.text(`Plats: ${project.location}`, margin, yPosition);
  yPosition += lineHeight;
  pdf.text(`Datum: ${project.createdAt.toLocaleDateString('sv-SE')}`, margin, yPosition);
  yPosition += lineHeight * 2;

  // AI Summary
  if (project.aiSummary) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('AI-Sammanfattning:', margin, yPosition);
    yPosition += lineHeight;
    pdf.setFont('helvetica', 'normal');

    const summaryLines = pdf.splitTextToSize(project.aiSummary, pageWidth - 2 * margin);
    summaryLines.forEach((line: string) => {
      if (yPosition > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    });
    yPosition += lineHeight;
  }

  // Notes
  if (project.notes.length > 0) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Anteckningar:', margin, yPosition);
    yPosition += lineHeight;
    pdf.setFont('helvetica', 'normal');

    project.notes.forEach((note, index) => {
      if (yPosition > pdf.internal.pageSize.getHeight() - margin * 2) {
        pdf.addPage();
        yPosition = margin;
      }

      const noteText = `${index + 1}. [${note.type.toUpperCase()}] ${note.transcription || note.kommentar}`;
      const noteLines = pdf.splitTextToSize(noteText, pageWidth - 2 * margin);

      noteLines.forEach((line: string) => {
        pdf.text(line, margin, yPosition);
        yPosition += lineHeight;
      });
      yPosition += lineHeight / 2;
    });
  }

  // Save PDF
  pdf.save(`${project.name}_inspection_report.pdf`);
};
