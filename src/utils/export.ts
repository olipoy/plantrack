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

  const sectionFieldGroups = [
    'Fastighetsuppgifter',
    'Besiktningsuppgifter',
    'Byggnadsbeskrivning',
    'Besiktningsutlåtande'
  ];

  const fieldSectionsData: any[] = [];

  if (project.sections) {
    for (const sectionName of sectionFieldGroups) {
      const section = project.sections.find(s => s.name === sectionName);
      if (section) {
        const fields = project.sectionFields?.[section.id] || {};
        const fieldsArray: any[] = [];

        for (const [fieldName, fieldValue] of Object.entries(fields)) {
          if (fieldValue && fieldValue.trim()) {
            const formattedFieldName = fieldName
              .replace(/_/g, ' ')
              .replace(/\b\w/g, char => char.toUpperCase());

            fieldsArray.push({
              label: formattedFieldName,
              value: fieldValue
            });
          }
        }

        fieldSectionsData.push({
          title: sectionName,
          hasFields: fieldsArray.length > 0,
          fields: fieldsArray
        });
      }
    }
  }

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

            const notesData = subsectionNotes.map(note => {
              let content = note.kommentar || '';
              if (!content && note.transcription) {
                content = note.transcription;
              } else if (!content && note.imageLabel) {
                content = note.imageLabel;
              }

              const icon = note.type === 'photo' ? '📷' : note.type === 'video' ? '🎥' : '📝';

              return {
                icon,
                content: content || 'Ingen kommentar'
              };
            });

            subsectionsData.push({
              name: subsection.name,
              hasNotes: notesData.length > 0,
              notes: notesData
            });
          }
        }

        mainSectionsData.push({
          name: sectionName,
          hasSubsections: subsectionsData.length > 0,
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
    fieldSections: fieldSectionsData,
    mainSections: mainSectionsData
  };

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
