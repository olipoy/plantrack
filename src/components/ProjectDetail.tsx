import React, { useState } from 'react';
import { Project, Note } from '../types';
import { ArrowLeft, Plus, Camera, Video, Download, Sparkles, AlertCircle, Play, Image, MapPin, Calendar, User, Trash2, MoreVertical } from 'lucide-react';
import { MediaRecorder } from './MediaRecorder';
import { exportProjectToPDF } from '../utils/export';
import { addNoteToProject, deleteProject } from '../utils/storage';
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

  const handleAddNote = async (note: Omit<Note, 'id'>) => {
    const projects = addNoteToProject(project.id, note);
    const updatedProject = projects.find(p => p.id === project.id);
    if (updatedProject) {
      onProjectUpdate(updatedProject);
    }
    setShowMediaRecorder(false);
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
          <div className="w-9" />
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
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1 min-w-0">
            <button
              onClick={onBack}
              className="mr-3 p-2 -ml-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h1>
              <div className="flex items-center text-sm text-gray-500 mt-1">
                <MapPin className="w-4 h-4 mr-1" />
                <span className="truncate mr-4">{project.location}</span>
                <Calendar className="w-4 h-4 mr-1" />
                <span className="mr-4">{formatProjectDate(project.date)}</span>
                <User className="w-4 h-4 mr-1" />
                <span className="truncate">{project.inspector}</span>
              </div>
            </div>
          </div>
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
      </div>

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

      <div className="flex-1 flex flex-col">
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

        <div className="flex-1 overflow-y-auto p-4">
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
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
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
                    <span className="text-xs text-gray-400">{formatDate(note.timestamp)}</span>
                  </div>
                  
                  {note.transcription && (
                    <p className="text-gray-900 whitespace-pre-wrap mb-3">
                      {note.transcription}
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
              className="w-full bg-teal-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center mb-4"
            >
              {isGeneratingSummary ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generera AI-sammanfattning
                </>
              )}
            </button>
          )}
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => openMediaRecorder('photo')}
              disabled={project.notes.length >= 20}
              className="flex flex-col items-center justify-center p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Camera className="w-6 h-6 mb-1" />
              <span className="text-sm font-medium">Foto</span>
            </button>
            <button
              onClick={() => openMediaRecorder('video')}
              disabled={project.notes.length >= 20}
              className="flex flex-col items-center justify-center p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Video className="w-6 h-6 mb-1" />
              <span className="text-sm font-medium">Video</span>
            </button>
          </div>
          
          {project.notes.length >= 20 && (
            <p className="text-xs text-gray-500 text-center mt-2">
              Maximalt antal anteckningar (20) har nåtts
            </p>
          )}
        </div>
      </div>
    </div>
  );
};