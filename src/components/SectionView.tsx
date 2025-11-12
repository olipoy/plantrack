import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Edit2, Trash2 } from 'lucide-react';
import { Section, Note } from '../types';
import { SubsectionsList } from './SubsectionsList';

interface SectionViewProps {
  section: Section;
  notes: Note[];
  onNoteClick: (note: Note) => void;
  onAddSubsection?: (parentSectionId: string) => void;
  onEditSection?: (section: Section) => void;
  onDeleteSection?: (sectionId: string) => void;
  level?: number;
}

export const SectionView: React.FC<SectionViewProps> = ({
  section,
  notes,
  onNoteClick,
  onAddSubsection,
  onEditSection,
  onDeleteSection,
  level = 0
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const sectionNotes = notes.filter(note => note.section_id === section.id);
  const hasSubsections = section.subsections && section.subsections.length > 0;
  const indentClass = level > 0 ? 'ml-4' : '';

  const sectionsWithSubsections = ['Utvändigt', 'Entréplan', 'Övre plan', 'Källarplan'];
  const shouldShowSubsectionsList = sectionsWithSubsections.includes(section.name);

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
              ({sectionNotes.length} {sectionNotes.length === 1 ? 'anteckning' : 'anteckningar'})
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
