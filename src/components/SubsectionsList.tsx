import React, { useState, useEffect } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { getSectionSubsections, createSubsection, Subsection } from '../utils/api';
import { SubsectionItem } from './SubsectionItem';
import { Note } from '../types';

interface SubsectionsListProps {
  sectionId: string;
  sectionName: string;
  projectId: string;
  onNoteClick: (note: Note) => void;
}

export const SubsectionsList: React.FC<SubsectionsListProps> = ({ sectionId, sectionName, projectId, onNoteClick }) => {
  const [subsections, setSubsections] = useState<Subsection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newSubsectionName, setNewSubsectionName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadSubsections();
  }, [sectionId]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadSubsections = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSectionSubsections(sectionId);
      setSubsections(data);
    } catch (err) {
      console.error('Failed to load subsections:', err);
      setError('Kunde inte ladda delområden');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSubsection = async () => {
    const trimmedName = newSubsectionName.trim();
    if (!trimmedName) return;

    setError(null);
    try {
      await createSubsection(sectionId, trimmedName);
      setNewSubsectionName('');
      setIsAdding(false);
      await loadSubsections();
      setToast('Delområde tillagt');
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE') {
        setToast('Delområdet finns redan');
      } else {
        console.error('Failed to create subsection:', err);
        setError('Kunde inte skapa delområde');
      }
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setNewSubsectionName('');
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddSubsection();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {isLoading ? (
        <div className="text-sm text-gray-500 py-2">Laddar delområden...</div>
      ) : (
        <>
          {subsections.length > 0 ? (
            <div className="space-y-2">
              {subsections.map((subsection) => (
                <SubsectionItem
                  key={subsection.id}
                  subsection={subsection}
                  projectId={projectId}
                  onDelete={loadSubsections}
                  onNoteClick={onNoteClick}
                />
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 py-2">
              Inga delområden tillagda ännu.
            </div>
          )}

          {isAdding ? (
            <div className="bg-white rounded-lg border border-blue-300 p-3 space-y-2">
              <input
                type="text"
                value={newSubsectionName}
                onChange={(e) => setNewSubsectionName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Namn på delområde"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddSubsection}
                  disabled={!newSubsectionName.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Spara
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Avbryt
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors w-full"
            >
              <Plus className="w-4 h-4" />
              Lägg till delområde
            </button>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}
    </div>
  );
};
