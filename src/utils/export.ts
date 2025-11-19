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

export const generateProjectPDF = async (project: Project): Promise<{ pdfBuffer: string; fileName: string }> => {
  console.log('=== INSPEKTIONSRAPPORT PDF GENERATION START ===');
  console.log('Project data:', {
    name: project.name,
    notesCount: project.notes?.length || 0,
    hasAiSummary: !!project.aiSummary
  });

  const ctx = createPDFContext();

  // Title
  console.log('Adding PDF title...');
  ctx.pdf.setFontSize(20);
  ctx.pdf.setFont('helvetica', 'bold');
  ctx.pdf.text('Inspektionsrapport', ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 2;

  // Project Info
  console.log('Adding project info...');
  ctx.pdf.setFontSize(12);
  ctx.pdf.setFont('helvetica', 'normal');
  ctx.pdf.text(`Projekt: ${project.name}`, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight;
  ctx.pdf.text(`Plats: ${project.location || 'Ej specificerad'}`, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight;
  ctx.pdf.text(`Datum: ${project.createdAt.toLocaleDateString('sv-SE')}`, ctx.margin, ctx.yPosition);
  ctx.yPosition += ctx.lineHeight * 2;

  // AI Summary
  if (project.aiSummary) {
    console.log('Adding AI summary...');
    ctx.pdf.setFont('helvetica', 'bold');
    ctx.pdf.text('AI-Sammanfattning:', ctx.margin, ctx.yPosition);
    ctx.yPosition += ctx.lineHeight;
    ctx.pdf.setFont('helvetica', 'normal');

    addWrappedText(ctx, project.aiSummary);
    ctx.yPosition += ctx.lineHeight;
  }

  // Notes
  if (project.notes && project.notes.length > 0) {
    console.log('Adding notes section...');
    ctx.pdf.setFont('helvetica', 'bold');
    ctx.pdf.text('Anteckningar:', ctx.margin, ctx.yPosition);
    ctx.yPosition += ctx.lineHeight;
    ctx.pdf.setFont('helvetica', 'normal');

    project.notes.forEach((note, index) => {
      console.log(`Processing note ${index + 1}/${project.notes.length}:`, note.type);

      checkPageBreak(ctx, ctx.margin * 2);

      let noteContent = note.kommentar || '';
      if (note.type === 'video' && note.transcription) {
        noteContent = note.transcription;
      } else if (note.type === 'photo' && note.imageLabel) {
        noteContent = note.imageLabel;
      }

      const noteText = `${index + 1}. [${note.type.toUpperCase()}] ${noteContent}`;
      addWrappedText(ctx, noteText);
      ctx.yPosition += ctx.lineHeight / 2;
    });
  }

  const fileName = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_inspection_report.pdf`;

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
