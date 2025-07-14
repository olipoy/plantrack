import React, { useState } from 'react';
import { Project, Note } from '../types';
import { ArrowLeft, Plus, Camera, Video, Download, Sparkles, AlertCircle, Play, Image, MapPin, Calendar, User, Trash2, MoreVertical, Upload, FileText, X } from 'lucide-react';
import { MediaRecorder } from './MediaRecorder';
import { exportProjectToPDF } from '../utils/export';
import { addNoteToProject, deleteProject, deleteNoteFromProject, generateId } from '../utils/storage';
import { summarizeNotes } from '../utils/api';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
  onProjectUpdate: (project: Project) => void;
  onProjectDelete: () => void;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack, onProjectUpdate, onProjectDelete }) => {
  const [showMediaRecorder, setShowMediaRecorder] = useState(false);
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<Note | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');

  const handleAddNote = async (note: Omit<Note, 'id'>) => {
    const projects = addNoteToProject(project.id, note);
    const updatedProject = projects.find(p => p.id === project.id);
    if (updatedProject) {
      onProjectUpdate(updatedProject);
    }
    setShowMediaRecorder(false);
  };

  const handleDeleteNote = (noteId: string) => {
    const projects = deleteNoteFromProject(project.id, noteId);
    const updatedProject = projects.find(p => p.id === project.id);
    if (updatedProject) {
      onProjectUpdate(updatedProject);
    }
  };

  const handleAddTextNote = () => {
    if (!newNoteText.trim()) return;
    
    const note: Omit<Note, 'id'> = {
      type: 'text',
      content: newNoteText.trim(),
      timestamp: new Date()
    };
    
    handleAddNote(note);
    setNewNoteText('');
    setShowAddNoteModal(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (project.notes.length >= 20) {
      alert('Du kan ha maximalt 20 anteckningar per projekt.');
      return;
    }

    // Create a note with the uploaded file
    const fileUrl = URL.createObjectURL(file);
    const fileType = file.type.startsWith('image/') ? 'photo' : 'video';
    
    const note: Omit<Note, 'id'> = {
      type: fileType,
      content: fileType === 'photo' ? 'Uppladdad bild' : 'Uppladdad video',
      timestamp: new Date(),
      fileUrl,
      fileName: file.name,
      fileSize: file.size
    };
    
    handleAddNote(note);
    
    // Reset the input
    event.target.value = '';
  };

  const handleDeleteProject = () => {
    deleteProject(project.id);
    onProjectDelete();
  };

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    setSummaryError('');
    
    try {
      const noteTexts = project.notes.map(note => note.transcription || note.content);
      const response = await summarizeNotes(noteTexts, project.name, project.location);
      
      const updatedProject = { ...project, aiSummary: response.summary };
      onProjectUpdate(updatedProject);
    } catch (error) {
      console.error('Error generating summary:', error);
      setSummaryError('Kunde inte generera sammanfattning. Kontrollera internetanslutningen och försök igen.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleExport = async () => {
    try {
      await exportProjectToPDF(project);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  };

  const openMediaRecorder = (type: 'photo' | 'video') => {
    if (project.notes.length >= 20) {
      alert('Du kan ha maximalt 20 anteckningar per projekt.');
      return;
    }
    setMediaType(type);
    setShowMediaRecorder(true);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatProjectDate = (date: Date) => {
    return date.toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'photo': return <Camera className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      case 'text': return <FileText className="w-4 h-4" />;
      default: return <Camera className="w-4 h-4" />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleMediaClick = (note: Note) => {
    if (note.fileUrl && (note.type === 'photo' || note.type === 'video')) {
      setSelectedMedia(note);
    }
  };

  if (showMediaRecorder) {
    return (
      <MediaRecorder
        type={mediaType}
        projectId={project.id}
        onBack={() => setShowMediaRecorder(false)}
        onSave={handleAddNote}
      />
    );
  }

  if (selectedMedia) {
    return (
      <div className="flex flex-col h-full bg-black">
        <div className="bg-black text-white px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSelectedMedia(null)}
            className="p-2 -ml-2 text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">
            {selectedMedia.type === 'photo' ? 'Foto' : 'Video'}
          </h1>
          <button
            onClick={() => {
              if (confirm('Är du säker på att du vill ta bort denna anteckning?')) {
                handleDeleteNote(selectedMedia.id);
                setSelectedMedia(null);
              }
            }}
            className="p-2 text-white hover:bg-red-600 rounded-lg transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center">
          {selectedMedia.type === 'photo' ? (
            <img 
              src={selectedMedia.fileUrl} 
              alt="Inspection media" 
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <video 
              src={selectedMedia.fileUrl} 
              controls 
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>

        {selectedMedia.transcription && (
          <div className="bg-black text-white p-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-300 mb-2">Transkribering:</p>
              <p className="text-white">{selectedMedia.transcription}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExport}
              className="p-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors"
            >
              <Download className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                className="p-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              
              {showOptionsMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[160px]">
                  <button
                    onClick={() => {
                      setShowOptionsMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="w-full flex items-center px-4 py-3 text-left text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 mr-3" />
                    Ta bort projekt
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Project Info - Mobile Optimized */}
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-gray-900">{project.name}</h1>
          <div className="grid grid-cols-1 gap-2 text-sm text-gray-600">
            <div className="flex items-center">
              <MapPin className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
              <span className="truncate">{project.location}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                <span>{formatProjectDate(project.date)}</span>
              </div>
              <div className="flex items-center">
                <User className="w-4 h-4 mr-2 text-gray-400" />
                <span className="truncate">{project.inspector}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Note Modal */}
      {showAddNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Lägg till textanteckning</h3>
              <button
                onClick={() => {
                  setShowAddNoteModal(false);
                  setNewNoteText('');
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Skriv din anteckning här..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
              autoFocus
            />
            <div className="flex space-x-3 mt-4">
              <button
                onClick={() => {
                  setShowAddNoteModal(false);
                  setNewNoteText('');
                }}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleAddTextNote}
                disabled={!newNoteText.trim()}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Ta bort projekt?</h3>
              <p className="text-gray-500 mb-6">
                Detta kommer permanent ta bort projektet "{project.name}" och alla dess anteckningar. 
                Denna åtgärd kan inte ångras.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleDeleteProject}
                  className="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  Ta bort
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close options menu */}
      {showOptionsMenu && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setShowOptionsMenu(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-h-0">
        {project.aiSummary && (
          <div className="bg-blue-50 border-b border-blue-200 p-4">
            <div className="flex items-center mb-2">
              <Sparkles className="w-5 h-5 text-blue-600 mr-2" />
              <h3 className="font-medium text-blue-900">AI-Sammanfattning</h3>
            </div>
            <div className="text-sm text-blue-800 whitespace-pre-line">
              {project.aiSummary}
            </div>
          </div>
        )}

        {summaryError && (
          <div className="bg-red-50 border-b border-red-200 p-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <p className="text-sm text-red-800">{summaryError}</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 pb-20">
          {project.notes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Inga anteckningar än</h3>
                <p className="text-gray-500 mb-4">Börja dokumentera din inspektion.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {project.notes.map((note) => (
                <div 
                  key={note.id} 
                  className={`bg-white rounded-xl p-4 shadow-sm border border-gray-200 ${
                    note.fileUrl && (note.type === 'photo' || note.type === 'video') 
                      ? 'cursor-pointer hover:shadow-md transition-shadow' 
                      : ''
                  }`}
                  onClick={() => handleMediaClick(note)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                        note.type === 'text' ? 'bg-green-100' : 'bg-blue-100'
                      }`}>
                        {getTypeIcon(note.type)}
                      </div>
                      <div>
                        <span className="text-sm text-gray-500 capitalize">{note.type}</span>
                        {note.fileSize && (
                          <span className="text-xs text-gray-400 ml-2">
                            ({formatFileSize(note.fileSize)})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-400">{formatDate(note.timestamp)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Är du säker på att du vill ta bort denna anteckning?')) {
                            handleDeleteNote(note.id);
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {(note.transcription || note.content) && (
                    <p className="text-gray-900 whitespace-pre-wrap mb-3">
                      {note.transcription || note.content}
                    </p>
                  )}
                  
                  {note.fileUrl && note.type === 'photo' && (
                    <div className="relative">
                      <img 
                        src={note.fileUrl} 
                        alt="Inspection photo" 
                        className="mt-3 rounded-lg max-w-full h-auto max-h-64 object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black bg-opacity-20 rounded-lg">
                        <Image className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  )}
                  
                  {note.fileUrl && note.type === 'video' && (
                    <div className="relative mt-3">
                      <video 
                        src={note.fileUrl} 
                        className="rounded-lg max-w-full h-auto max-h-64 object-cover"
                        poster=""
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-lg">
                        <Play className="w-12 h-12 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border-t border-gray-200 p-4">
          {project.notes.length > 0 && !project.aiSummary && (
            <button
              onClick={handleGenerateSummary}
              disabled={isGeneratingSummary}
              className="w-full bg-teal-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center mb-3"
            >
              {isGeneratingSummary ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generera AI-sammanfattning
                </>
              )}
            </button>
          )}
          
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => openMediaRecorder('photo')}
              disabled={project.notes.length >= 20}
              className="flex flex-col items-center justify-center p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Camera className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">Foto</span>
            </button>
            <button
              onClick={() => openMediaRecorder('video')}
              disabled={project.notes.length >= 20}
              className="flex flex-col items-center justify-center p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Video className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">Video</span>
            </button>
            <label className="flex flex-col items-center justify-center p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors cursor-pointer">
              <Upload className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">Ladda upp</span>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={project.notes.length >= 20}
              />
            </label>
            <button
              onClick={() => setShowAddNoteModal(true)}
              disabled={project.notes.length >= 20}
              className="flex flex-col items-center justify-center p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <FileText className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">Text</span>
            </button>
          </div>
          
          {project.notes.length >= 20 && (
            <p className="text-xs text-gray-500 text-center mt-1">
              Maximalt antal anteckningar (20) har nåtts
            </p>
          )}
        </div>
      </div>
    </div>
  );
};