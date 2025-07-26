import React, { useState } from 'react';
import { ArrowLeft, Camera, Video, Plus, FileText, MapPin, Calendar, User, Share, Trash2, MoreVertical, Edit3, Send, CheckCircle } from 'lucide-react';
import { Project, Note } from '../types';
import { CameraView } from './CameraView';
import { MediaRecorder } from './MediaRecorder';
import { updateNoteLabel, summarizeNotes, generateIndividualReport, submitIndividualReport } from '../utils/api';
import { exportProjectToPDF, generateProjectPDF, sendEmailWithPDF } from '../utils/export';
import { IndividualReportModal } from './IndividualReportModal';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
  onProjectUpdate: (project: Project) => void;
  onProjectDelete: () => void;
}

type View = 'detail' | 'camera' | 'recorder';

export const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  onBack,
  onProjectUpdate,
  onProjectDelete
}) => {
  const [currentView, setCurrentView] = useState<View>('detail');
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [showIndividualModal, setShowIndividualModal] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const handleNoteAdded = (note: Omit<Note, 'id'>) => {
    const newNote: Note = {
      ...note,
      id: Date.now().toString() // Temporary ID, will be replaced by backend
    };
    
    const updatedProject = {
      ...project,
      notes: [newNote, ...project.notes],
      updatedAt: new Date()
    };
    
    onProjectUpdate(updatedProject);
    setCurrentView('detail');
  };

  const handleGenerateSummary = async () => {
    if (project.notes.length === 0) {
      alert('Inga anteckningar att sammanfatta');
      return;
    }

    setIsGeneratingSummary(true);
    try {
      const response = await summarizeNotes(project.id);
      const updatedProject = {
        ...project,
        aiSummary: response.summary,
        updatedAt: new Date()
      };
      onProjectUpdate(updatedProject);
    } catch (error) {
      console.error('Summarization failed:', error);
      alert('Kunde inte generera sammanfattning. Försök igen.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleShareProject = async (email: string, subject: string, message: string) => {
    try {
      const { pdfBuffer, fileName } = await generateProjectPDF(project);
      await sendEmailWithPDF(email, subject, pdfBuffer, fileName, message, project.id);
      setShowShareModal(false);
      alert('Rapport skickad!');
    } catch (error) {
      console.error('Failed to send email:', error);
      alert('Kunde inte skicka rapport. Försök igen.');
    }
  };

  const handleDeleteProject = async () => {
    try {
      await onProjectDelete();
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Kunde inte ta bort projekt. Försök igen.');
    }
  };

  const handleEditLabel = async (noteId: string, newLabel: string) => {
    try {
      await updateNoteLabel(noteId, newLabel);
      
      const updatedNotes = project.notes.map(note =>
        note.id === noteId ? { ...note, imageLabel: newLabel } : note
      );
      
      const updatedProject = {
        ...project,
        notes: updatedNotes,
        updatedAt: new Date()
      };
      
      onProjectUpdate(updatedProject);
      setEditingNoteId(null);
      setEditingLabel('');
    } catch (error) {
      console.error('Failed to update label:', error);
      alert('Kunde inte uppdatera etikett. Försök igen.');
    }
  };

  const handleIndividualReport = (noteId: string) => {
    setSelectedNoteId(noteId);
    setShowIndividualModal(true);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderNoteContent = (note: Note) => {
    if (note.type === 'photo') {
      return (
        <div className="space-y-3">
          {note.fileUrl && (
            <img
              src={note.fileUrl}
              alt="Inspection photo"
              className="w-full h-48 object-cover rounded-lg"
            />
          )}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {note.imageLabel || note.content || 'Foto taget'}
            </p>
            {note.imageLabel && (
              <button
                onClick={() => {
                  setEditingNoteId(note.id);
                  setEditingLabel(note.imageLabel || '');
                }}
                className="text-blue-600 hover:text-blue-700 text-xs"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      );
    }

    if (note.type === 'video') {
      return (
        <div className="space-y-3">
          {note.fileUrl && (
            <video
              src={note.fileUrl}
              controls
              className="w-full h-48 object-cover rounded-lg"
            />
          )}
          <p className="text-sm text-gray-800">
            {note.transcription || note.content || 'Videoinspelning'}
          </p>
        </div>
      );
    }

    return (
      <p className="text-sm text-gray-800">
        {note.content}
      </p>
    );
  };

  if (currentView === 'camera') {
    return (
      <CameraView
        projectId={project.id}
        mode={cameraMode}
        onBack={() => setCurrentView('detail')}
        onSave={handleNoteAdded}
      />
    );
  }

  if (currentView === 'recorder') {
    return (
      <MediaRecorder
        projectId={project.id}
        onBack={() => setCurrentView('detail')}
        onSave={handleNoteAdded}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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
              <h1 className="text-lg font-semibold text-gray-900 truncate">
                {project.name}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 ml-3">
            <button
              onClick={() => setShowShareModal(true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Share className="w-5 h-5" />
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              
              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[140px]">
                  <button
                    onClick={() => {
                      exportProjectToPDF(project);
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Exportera PDF
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(true);
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Ta bort projekt
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Project Info */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="space-y-2">
          <div className="flex items-center text-gray-600 text-sm">
            <MapPin className="w-4 h-4 mr-2" />
            <span>{project.location}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center text-gray-600 text-sm">
              <Calendar className="w-4 h-4 mr-2" />
              <span>{formatDate(project.date)}</span>
            </div>
            <div className="flex items-center text-gray-600 text-sm">
              <User className="w-4 h-4 mr-2" />
              <span>{project.inspector}</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {project.aiSummary && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">AI-Sammanfattning</h3>
          <p className="text-sm text-blue-800 whitespace-pre-wrap">{project.aiSummary}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {project.notes.length === 0 ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Inga anteckningar än</h3>
              <p className="text-gray-500 mb-6">Börja dokumentera din inspektion genom att ta foton, spela in video eller lägga till textanteckningar.</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {project.notes.map((note) => (
              <div key={note.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    {note.type === 'photo' && <Camera className="w-4 h-4 text-blue-600 mr-2" />}
                    {note.type === 'video' && <Video className="w-4 h-4 text-red-600 mr-2" />}
                    {note.type === 'text' && <FileText className="w-4 h-4 text-green-600 mr-2" />}
                    <span className="text-xs text-gray-500">
                      {formatTime(note.timestamp)}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {note.submitted && (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    )}
                    <button
                      onClick={() => handleIndividualReport(note.id)}
                      className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {editingNoteId === note.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="Uppdatera etikett..."
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditLabel(note.id, editingLabel)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                      >
                        Spara
                      </button>
                      <button
                        onClick={() => {
                          setEditingNoteId(null);
                          setEditingLabel('');
                        }}
                        className="px-3 py-1 text-gray-600 hover:text-gray-800 text-xs"
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                ) : (
                  renderNoteContent(note)
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex space-x-3 mb-4">
          <button
            onClick={() => {
              setCameraMode('photo');
              setCurrentView('camera');
            }}
            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center"
          >
            <Camera className="w-5 h-5 mr-2" />
            Foto
          </button>
          <button
            onClick={() => {
              setCameraMode('video');
              setCurrentView('camera');
            }}
            className="flex-1 bg-red-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-red-700 transition-colors flex items-center justify-center"
          >
            <Video className="w-5 h-5 mr-2" />
            Video
          </button>
          <button
            onClick={() => setCurrentView('recorder')}
            className="flex-1 bg-green-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Text
          </button>
        </div>

        {project.notes.length > 0 && (
          <button
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
            className="w-full bg-purple-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {isGeneratingSummary ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <FileText className="w-5 h-5 mr-2" />
            )}
            {isGeneratingSummary ? 'Genererar...' : 'Generera AI-sammanfattning'}
          </button>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          project={project}
          onClose={() => setShowShareModal(false)}
          onShare={handleShareProject}
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Ta bort projekt</h3>
            <p className="text-gray-600 mb-6">
              Är du säker på att du vill ta bort detta projekt? Detta kan inte ångras.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleDeleteProject}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Ta bort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Report Modal */}
      {showIndividualModal && selectedNoteId && (
        <IndividualReportModal
          noteId={selectedNoteId}
          note={project.notes.find(n => n.id === selectedNoteId)!}
          onClose={() => {
            setShowIndividualModal(false);
            setSelectedNoteId(null);
          }}
        />
      )}
    </div>
  );
};

// Share Modal Component
interface ShareModalProps {
  project: Project;
  onClose: () => void;
  onShare: (email: string, subject: string, message: string) => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ project, onClose, onShare }) => {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(`Inspektionsrapport - ${project.name}`);
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && subject.trim()) {
      onShare(email.trim(), subject.trim(), message.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Dela rapport</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              E-postadress
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="mottagare@email.se"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ämne
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meddelande (valfritt)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Lägg till ett meddelande..."
            />
          </div>
          
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Avbryt
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Skicka
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};