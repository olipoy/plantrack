import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Trash2, Camera, Mic, FileText } from 'lucide-react';
import { getSubsectionNotes, createTextNoteForSubsection, deleteSubsection, uploadFile } from '../utils/api';
import { Note } from '../types';

interface SubsectionItemProps {
  subsection: {
    id: string;
    name: string;
    section_id: string;
  };
  projectId: string;
  onDelete: () => void;
  onNoteClick: (note: Note) => void;
}

export const SubsectionItem: React.FC<SubsectionItemProps> = ({
  subsection,
  projectId,
  onDelete,
  onNoteClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingText, setIsSavingText] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      loadNotes();
    }
  }, [isExpanded, subsection.id]);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const data = await getSubsectionNotes(subsection.id);
      setNotes(data);
    } catch (err) {
      console.error('Failed to load subsection notes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Är du säker på att du vill ta bort "${subsection.name}"?`)) {
      return;
    }
    try {
      await deleteSubsection(subsection.id);
      onDelete();
    } catch (err) {
      console.error('Failed to delete subsection:', err);
      alert('Kunde inte ta bort delområde');
    }
  };

  const handleTextNoteSave = async () => {
    const trimmedContent = textContent.trim();
    if (!trimmedContent) return;

    setIsSavingText(true);
    try {
      await createTextNoteForSubsection(projectId, subsection.id, trimmedContent);
      setTextContent('');
      setShowTextInput(false);
      await loadNotes();
    } catch (err) {
      console.error('Failed to create text note:', err);
      alert('Kunde inte skapa anteckning');
    } finally {
      setIsSavingText(false);
    }
  };

  const handleTextInputCancel = () => {
    setTextContent('');
    setShowTextInput(false);
  };

  const handleTextInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextNoteSave();
    } else if (e.key === 'Escape') {
      handleTextInputCancel();
    }
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadFile(file, projectId, 'photo', undefined, subsection.id);
      await loadNotes();
    } catch (err) {
      console.error('Failed to upload image:', err);
      alert('Kunde inte ladda upp bild');
    } finally {
      setIsUploading(false);
    }
  };

  const handleVoiceRecording = async () => {
    try {
      setIsRecording(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], 'voice-note.webm', { type: 'audio/webm' });

        setIsRecording(false);
        setIsUploading(true);
        try {
          await uploadFile(file, projectId, 'text', undefined, subsection.id);
          await loadNotes();
        } catch (err) {
          console.error('Failed to upload voice note:', err);
          alert('Kunde inte ladda upp röstanteckning');
        } finally {
          setIsUploading(false);
        }

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 30000);

      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 5000);
    } catch (err) {
      console.error('Failed to record voice:', err);
      alert('Kunde inte spela in ljud');
      setIsRecording(false);
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '…';
  };

  return (
    <>
      <div className="bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center flex-1">
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
            <span className="text-sm font-medium text-gray-700">{subsection.name}</span>
            {notes.length > 0 && (
              <span className="ml-2 text-xs text-gray-500">
                ({notes.length} {notes.length === 1 ? 'anteckning' : 'anteckningar'})
              </span>
            )}
          </div>
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-red-600 transition-colors p-1"
            aria-label="Ta bort delområde"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {isExpanded && (
          <div className="px-3 pb-3 space-y-3">
            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setShowTextInput(true)}
                disabled={isUploading || isRecording || showTextInput}
                className="flex flex-col items-center gap-1 p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText className="w-5 h-5 text-gray-600" />
                <span className="text-xs text-gray-600">Text</span>
              </button>

              <button
                onClick={handleVoiceRecording}
                disabled={isUploading || isRecording}
                className="flex flex-col items-center gap-1 p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mic className={`w-5 h-5 ${isRecording ? 'text-red-600 animate-pulse' : 'text-gray-600'}`} />
                <span className="text-xs text-gray-600">{isRecording ? 'Spelar in...' : 'Röst'}</span>
              </button>

              <label className="flex flex-col items-center gap-1 p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <Camera className="w-5 h-5 text-gray-600" />
                <span className="text-xs text-gray-600">Foto</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageCapture}
                  disabled={isUploading || isRecording}
                  className="hidden"
                />
              </label>
            </div>

            {/* Inline Text Input */}
            {showTextInput && (
              <div className="bg-white rounded-lg border border-gray-300 p-3 space-y-2 shadow-sm">
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  onKeyDown={handleTextInputKeyDown}
                  placeholder="Skriv anteckning här…"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  autoFocus
                  disabled={isSavingText}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleTextNoteSave}
                    disabled={!textContent.trim() || isSavingText}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSavingText ? 'Sparar...' : 'Spara'}
                  </button>
                  <button
                    onClick={handleTextInputCancel}
                    disabled={isSavingText}
                    className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}

            {isUploading && (
              <div className="text-sm text-blue-600 text-center py-2">
                Laddar upp...
              </div>
            )}

            {/* Notes List */}
            {isLoading ? (
              <div className="text-sm text-gray-500 py-2">Laddar anteckningar...</div>
            ) : notes.length > 0 ? (
              <div className="space-y-2">
                {notes.map((note) => (
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
                    {note.kommentar && (
                      <p className="text-xs text-gray-600 mb-1">
                        {truncateText(note.kommentar, 80)}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      {new Date(note.created_at || note.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-2">
                Inga anteckningar tillagda ännu
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
