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

  // Extract Besiktningsutlåtande as free text string
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

  // Extract main sections with subsections and notes
  const mainSectionNames = ['Utvändigt', 'Entréplan', 'Övre plan', 'Källarplan'];
  const mainSectionsData: any[] = [];

  console.log('=== DEBUG: Starting notes extraction ===');
  console.log('Total notes available:', project.notes?.length || 0);
  console.log('Notes data:', JSON.stringify(project.notes?.map(n => ({
    id: n.id,
    section_id: n.section_id,
    subsection_id: n.subsection_id,
    type: n.type,
    kommentar: n.kommentar?.substring(0, 30)
  })), null, 2));

  // Count notes by subsection_id
  const notesWithSubsectionId = project.notes?.filter(n => n.subsection_id) || [];
  console.log(`Notes with subsection_id: ${notesWithSubsectionId.length}/${project.notes?.length || 0}`);

  if (project.sections && project.notes) {
    for (const sectionName of mainSectionNames) {
      const mainSection = project.sections.find(s => s.name === sectionName);
      console.log(`\n=== Processing section: ${sectionName} ===`);
      console.log('Found section:', !!mainSection);

      if (mainSection && mainSection.subsections && mainSection.subsections.length > 0) {
        console.log(`Section has ${mainSection.subsections.length} subsections`);
        const subsectionsData: any[] = [];

        for (const subsection of mainSection.subsections) {
          console.log(`  Checking subsection: ${subsection.name} (ID: ${subsection.id})`);

          const subsectionNotes = project.notes.filter(note =>
            note.subsection_id === subsection.id
          );

          console.log(`    Found ${subsectionNotes.length} notes with subsection_id=${subsection.id}`);

          if (subsectionNotes.length > 0) {
            const notesData = subsectionNotes.map(note => {
              let content = note.kommentar || '';
              if (!content && note.transcription) {
                content = note.transcription;
              } else if (!content && note.imageLabel) {
                content = note.imageLabel;
              }

              const imageUrl = note.type === 'photo' && note.mediaUrl ? note.mediaUrl : null;

              return {
                content: content || 'Ingen kommentar',
                imageUrl: imageUrl
              };
            });

            subsectionsData.push({
              name: subsection.name,
              notes: notesData
            });
          }
        }

        // Only add section if it has subsections with notes
        if (subsectionsData.length > 0) {
          mainSectionsData.push({
            name: sectionName,
            hasSubsections: true,
            subsections: subsectionsData
          });
        }
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
    fastighetsuppgifter: fastighetsuppgifter,
    besiktningsuppgifter: besiktningsuppgifter,
    byggnadsbeskrivning: byggnadsbeskrivning,
    besiktningsutlatande: besiktningsutlatande,
    mainSections: mainSectionsData
  };

  console.log('=== TEMPLATE DATA STRUCTURE ===');
  console.log('Project:', templateData.project);
  console.log('Fastighetsuppgifter count:', fastighetsuppgifter.length);
  console.log('Besiktningsuppgifter count:', besiktningsuppgifter.length);
  console.log('Byggnadsbeskrivning count:', byggnadsbeskrivning.length);
  console.log('Besiktningsutlåtande length:', besiktningsutlatande.length);
  console.log('Main sections count:', mainSectionsData.length);

  mainSectionsData.forEach((section, idx) => {
    console.log(`Section ${idx + 1} - ${section.name}:`);
    console.log(`  Subsections: ${section.subsections.length}`);
    section.subsections.forEach((subsection: any, subIdx: number) => {
      console.log(`    ${subIdx + 1}. ${subsection.name} - ${subsection.notes.length} notes`);
      subsection.notes.forEach((note: any, noteIdx: number) => {
        console.log(`       Note ${noteIdx + 1}: content=${note.content.substring(0, 50)}..., hasImage=${!!note.imageUrl}`);
      });
    });
  });

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
