import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Plus, Edit2, Trash2 } from 'lucide-react';
import { Section, Note } from '../types';
import { SubsectionsList } from './SubsectionsList';
import { getSectionSubsections } from '../utils/api';

interface SectionViewProps {
  section: Section;
  notes: Note[];
  projectId: string;
  onNoteClick: (note: Note) => void;
  onAddSubsection?: (parentSectionId: string) => void;
  onEditSection?: (section: Section) => void;
  onDeleteSection?: (sectionId: string) => void;
  level?: number;
}

export const SectionView: React.FC<SectionViewProps> = ({
  section,
  notes,
  projectId,
  onNoteClick,
  onAddSubsection,
  onEditSection,
  onDeleteSection,
  level = 0
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [subsectionIds, setSubsectionIds] = useState<string[]>([]);
  const [isLoadingSubsections, setIsLoadingSubsections] = useState(false);

  const sectionNotes = notes.filter(note => note.section_id === section.id);
  const hasSubsections = section.subsections && section.subsections.length > 0;
  const indentClass = level > 0 ? 'ml-4' : '';

  const sectionsWithSubsections = ['Utvändigt', 'Entréplan', 'Övre plan', 'Källarplan'];
  const shouldShowSubsectionsList = sectionsWithSubsections.includes(section.name);

  // Load subsections for sections that use SubsectionsList
  useEffect(() => {
    if (shouldShowSubsectionsList) {
      loadSubsections();
    }
  }, [section.id, shouldShowSubsectionsList]);

  const loadSubsections = async () => {
    setIsLoadingSubsections(true);
    try {
      const subs = await getSectionSubsections(section.id);
      setSubsectionIds(subs.map((s: any) => s.id));
    } catch (error) {
      console.error('Failed to load subsections for counting:', error);
      setSubsectionIds([]);
    } finally {
      setIsLoadingSubsections(false);
    }
  };

  // Count total notes including all subsections recursively
  const getTotalNotesCount = (currentSection: Section): number => {
    let count = 0;

    // For sections using SubsectionsList, count notes by section_id OR subsection_id
    if (shouldShowSubsectionsList) {
      // Count notes with section_id matching this section (includes notes with parent section_id set)
      count += notes.filter(note => note.section_id === currentSection.id).length;

      // Also count notes with subsection_id matching loaded subsections (for backward compatibility with old notes)
      if (subsectionIds.length > 0) {
        const subsectionNotesCount = notes.filter(note =>
          note.subsection_id && subsectionIds.includes(note.subsection_id) && note.section_id !== currentSection.id
        ).length;
        count += subsectionNotesCount;
      }
    } else {
      // For traditional hierarchy, count notes directly in this section
      count = notes.filter(note => note.section_id === currentSection.id).length;

      // Recursively count notes in all subsections
      if (currentSection.subsections && currentSection.subsections.length > 0) {
        currentSection.subsections.forEach(subsection => {
          count += getTotalNotesCount(subsection);
        });
      }
    }

    return count;
  };

  const totalNotesCount = getTotalNotesCount(section);

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '…';
  };

  return (
    <div className={indentClass}>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1">
            {(hasSubsections || section.allow_subsections) && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mr-2 text-gray-600 hover:text-gray-900"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            )}
            <h3 className="font-medium text-gray-900">
              {section.name}
            </h3>
            <span className="ml-2 text-xs text-gray-500">
              ({totalNotesCount} {totalNotesCount === 1 ? 'anteckning' : 'anteckningar'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {section.allow_subsections && onAddSubsection && (
              <button
                onClick={() => onAddSubsection(section.id)}
                className="text-blue-600 hover:text-blue-700 p-1"
                title="Lägg till undersektion"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            {onEditSection && (
              <button
                onClick={() => onEditSection(section)}
                className="text-gray-600 hover:text-gray-700 p-1"
                title="Redigera sektion"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            {onDeleteSection && !hasSubsections && sectionNotes.length === 0 && (
              <button
                onClick={() => onDeleteSection(section.id)}
                className="text-red-600 hover:text-red-700 p-1"
                title="Ta bort sektion"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {isExpanded && sectionNotes.length > 0 && (
          <div className="mt-3 space-y-2">
            {sectionNotes
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .map((note) => (
                <div
                  key={note.id}
                  onClick={() => onNoteClick(note)}
                  className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center mb-1">
                    <span className="text-xs font-medium text-gray-700">
                      {note.type === 'photo' ? '📷 Foto' : note.type === 'video' ? '🎥 Video' : '📝 Text'}
                    </span>
                  </div>

                  {note.delomrade && (
                    <p className="text-xs text-gray-700 font-medium mb-1">
                      {note.delomrade}
                    </p>
                  )}

                  {note.kommentar && (
                    <p className="text-xs text-gray-600 mb-1">
                      {truncateText(note.kommentar, 80)}
                    </p>
                  )}

                  <p className="text-xs text-gray-500">
                    {new Date(note.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}
          </div>
        )}

        {isExpanded && shouldShowSubsectionsList && (
          <SubsectionsList
            sectionId={section.id}
            sectionName={section.name}
            projectId={projectId}
            onNoteClick={onNoteClick}
          />
        )}
      </div>

      {isExpanded && hasSubsections && (
        <div className="ml-4 space-y-2">
          {section.subsections!.map((subsection) => (
            <SectionView
              key={subsection.id}
              section={subsection}
              notes={notes}
              projectId={projectId}
              onNoteClick={onNoteClick}
              onAddSubsection={onAddSubsection}
              onEditSection={onEditSection}
              onDeleteSection={onDeleteSection}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};
