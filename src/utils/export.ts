import { Project, Note, Section } from '../types';
import { renderHtmlTemplate, generatePdfFromHtml } from './pdfTemplates';

// ===========================
// SHARED UTILITIES
// ===========================

const formatSwedishDate = (date: Date): string => {
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
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

// ===========================
// INSPEKTIONSRAPPORT TEMPLATE
// ===========================

export const generateProjectPDF = async (project: Project): Promise<{ pdfBuffer: string; fileName: string }> => {
  console.log('=== INSPEKTIONSRAPPORT PDF GENERATION START ===');
  console.log('Project data:', {
    name: project.name,
    notesCount: project.notes?.length || 0,
  });

  const inspectionDate = project.date ? new Date(project.date) : new Date();

  const groupedNotes = project.notes && project.notes.length > 0
    ? groupNotesByDelomrade(project.notes)
    : new Map();

  const notesArray: any[] = [];
  for (const [delomrade, notes] of groupedNotes) {
    for (const note of notes) {
      let kommentar = note.kommentar || '';
      if (!kommentar && note.transcription) {
        kommentar = note.transcription;
      } else if (!kommentar && note.imageLabel) {
        kommentar = note.imageLabel;
      }

      const imageUrl = note.type === 'photo' && note.mediaUrl ? note.mediaUrl : null;

      console.log('Processing note for PDF:', {
        noteId: note.id,
        type: note.type,
        hasMediaUrl: !!note.mediaUrl,
        mediaUrl: note.mediaUrl,
        imageUrl: imageUrl,
        delomrade: delomrade
      });

      notesArray.push({
        delomrade,
        comment: kommentar || 'Ingen kommentar',
        imageUrl: imageUrl
      });
    }
  }

  console.log('Final notes array for template:', JSON.stringify(notesArray.map(n => ({
    delomrade: n.delomrade,
    hasComment: !!n.comment,
    hasImageUrl: !!n.imageUrl,
    imageUrlPreview: n.imageUrl ? n.imageUrl.substring(0, 100) + '...' : null
  })), null, 2));

  const templateData = {
    project: {
      name: project.name,
      address: project.location || 'Ej angiven',
      date: formatSwedishDate(inspectionDate),
      inspector: project.inspector || 'Ej angiven'
    },
    hasNotes: notesArray.length > 0,
    notes: notesArray
  };

  const html = await renderHtmlTemplate('inspektionsrapport', templateData);

  const fileName = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_inspektionsrapport.pdf`;

  const result = await generatePdfFromHtml(html, fileName);

  console.log('=== INSPEKTIONSRAPPORT PDF GENERATION COMPLETE ===');
  return result;
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

  const inspectionDate = project.date ? new Date(project.date) : new Date();

  // Extract Projektinformation fields
  const projektinformationSection = project.sections?.find(s => s.name === 'Projektinformation');
  const projektinformationFields = projektinformationSection ? project.sectionFields?.[projektinformationSection.id] || {} : {};
  const projectInfo: any[] = [];
  for (const [fieldName, fieldValue] of Object.entries(projektinformationFields)) {
    if (fieldValue && fieldValue.trim()) {
      const formattedFieldName = fieldName
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
      projectInfo.push({
        label: formattedFieldName,
        value: fieldValue
      });
    }
  }

  // Extract Fastighetsuppgifter fields
  const fastighetsuppgifterSection = project.sections?.find(s => s.name === 'Fastighetsuppgifter');
  const fastighetsuppgifterFields = fastighetsuppgifterSection ? project.sectionFields?.[fastighetsuppgifterSection.id] || {} : {};
  const fastighetsuppgifter: any[] = [];
  for (const [fieldName, fieldValue] of Object.entries(fastighetsuppgifterFields)) {
    if (fieldValue && fieldValue.trim()) {
      const formattedFieldName = fieldName
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
      fastighetsuppgifter.push({
        label: formattedFieldName,
        value: fieldValue
      });
    }
  }

  // Extract Besiktningsuppgifter fields
  const besiktningsuppgifterSection = project.sections?.find(s => s.name === 'Besiktningsuppgifter');
  const besiktningsuppgifterFields = besiktningsuppgifterSection ? project.sectionFields?.[besiktningsuppgifterSection.id] || {} : {};
  const besiktningsuppgifter: any[] = [];
  for (const [fieldName, fieldValue] of Object.entries(besiktningsuppgifterFields)) {
    if (fieldValue && fieldValue.trim()) {
      const formattedFieldName = fieldName
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
      besiktningsuppgifter.push({
        label: formattedFieldName,
        value: fieldValue
      });
    }
  }

  // Extract Byggnadsbeskrivning fields
  const byggnadsbeskrivningSection = project.sections?.find(s => s.name === 'Byggnadsbeskrivning');
  const byggnadsbeskrivningFields = byggnadsbeskrivningSection ? project.sectionFields?.[byggnadsbeskrivningSection.id] || {} : {};
  const byggnadsbeskrivning: any[] = [];
  for (const [fieldName, fieldValue] of Object.entries(byggnadsbeskrivningFields)) {
    if (fieldValue && fieldValue.trim()) {
      const formattedFieldName = fieldName
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
      byggnadsbeskrivning.push({
        label: formattedFieldName,
        value: fieldValue
      });
    }
  }

  // Extract Besiktningsutlåtande as free text
  const besiktningsutlatandeSection = project.sections?.find(s => s.name === 'Besiktningsutlåtande');
  const besiktningsutlatandeFields = besiktningsutlatandeSection ? project.sectionFields?.[besiktningsutlatandeSection.id] || {} : {};
  let besiktningsutlatande = '';
  // Concatenate all field values as free text
  for (const [fieldName, fieldValue] of Object.entries(besiktningsutlatandeFields)) {
    if (fieldValue && fieldValue.trim()) {
      besiktningsutlatande += fieldValue + ' ';
    }
  }
  besiktningsutlatande = besiktningsutlatande.trim();

  // Extract main sections with subsections
  const mainSectionNames = ['Utvändigt', 'Entréplan', 'Övre plan', 'Källarplan'];
  const mainSectionsData: any[] = [];

  if (project.sections && project.notes) {
    for (const sectionName of mainSectionNames) {
      const mainSection = project.sections.find(s => s.name === sectionName);
      if (mainSection) {
        const subsectionsData: any[] = [];

        if (mainSection.subsections && mainSection.subsections.length > 0) {
          for (const subsection of mainSection.subsections) {
            const subsectionNotes = project.notes.filter(note =>
              note.subsection_id === subsection.id
            );

            // Process each note to extract comment and imageUrl
            for (const note of subsectionNotes) {
              let comment = note.kommentar || '';
              if (!comment && note.transcription) {
                comment = note.transcription;
              } else if (!comment && note.imageLabel) {
                comment = note.imageLabel;
              }

              const imageUrl = note.type === 'photo' && note.mediaUrl ? note.mediaUrl : null;

              subsectionsData.push({
                title: subsection.name,
                comment: comment || 'Ingen kommentar',
                imageUrl: imageUrl
              });
            }
          }
        }

        mainSectionsData.push({
          name: sectionName,
          subsections: subsectionsData
        });
      }
    }
  }

  const templateData = {
    project: {
      name: project.name,
      address: project.location || 'Ej angiven',
      date: formatSwedishDate(inspectionDate),
      inspector: project.inspector || 'Ej angiven'
    },
    projectInfo: projectInfo,
    fastighetsuppgifter: fastighetsuppgifter,
    besiktningsuppgifter: besiktningsuppgifter,
    byggnadsbeskrivning: byggnadsbeskrivning,
    besiktningsutlatande: besiktningsutlatande,
    mainSections: mainSectionsData
  };

  console.log('Template data structure:', JSON.stringify({
    project: templateData.project,
    projectInfoCount: projectInfo.length,
    fastighetsuppgifterCount: fastighetsuppgifter.length,
    besiktningsuppgifterCount: besiktningsuppgifter.length,
    byggnadsbeskrivningCount: byggnadsbeskrivning.length,
    besiktningsutlatandeLength: besiktningsutlatande.length,
    mainSectionsCount: mainSectionsData.length,
    totalSubsections: mainSectionsData.reduce((sum, s) => sum + s.subsections.length, 0)
  }, null, 2));

  const html = await renderHtmlTemplate('besiktningsprotokoll', templateData);

  const fileName = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_besiktningsprotokoll.pdf`;

  const result = await generatePdfFromHtml(html, fileName);

  console.log('=== BESIKTNINGSPROTOKOLL PDF GENERATION COMPLETE ===');
  return result;
};

// ===========================
// LEGACY EXPORT (UNUSED)
// ===========================

export const exportProjectToPDF = async (project: Project): Promise<void> => {
  console.warn('exportProjectToPDF is deprecated and no longer implemented');
};
