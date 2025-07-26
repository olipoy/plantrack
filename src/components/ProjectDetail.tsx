import React, { useState } from 'react';
import { Project, Note } from '../types';
import { ArrowLeft, Camera, Video, Type, Sparkles, FileText, Download, Mail, MoreVertical, Edit3, Send, CheckCircle } from 'lucide-react';
import { CameraView } from './CameraView';
import { MediaRecorder } from './MediaRecorder';
import { summarizeNotes, updateNoteLabel, sendEmailWithPDF } from '../utils/api';
import { exportProjectToPDF, generateProjectPDF } from '../utils/export';
import { IndividualReportModal } from './IndividualReportModal';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
  onProjectUpdate: (project: Project) => void;
  onProjectDelete: () => void;
}

type View = 'main' | 'camera-photo' | 'camera-video' | 'text-note';

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ 
  project, 
  onBack, 
  onProjectUpdate,
  onProjectDelete 
}) => {
  const [currentView, setCurrentView] = useState<View>('main');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ to: '', subject: '', message: '' });
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [showIndividualModal, setShowIndividualModal] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Text note state
  const [textNoteContent, setTextNoteContent] = useState('');
  const [isSavingTextNote, setIsSavingTextNote] = useState(false);

  const handleAddNote = (note: Omit<Note, 'id'>) => {
    console.log('Adding note to project:', note);
    const newNote: Note = {
      ...note,
      id: Date.now().toString() // Temporary ID, will be replaced by backend
    };
    
    const updatedProject = {
      ...project,
      notes: [...project.notes, newNote],
      updatedAt: new Date()
    };
    
    console.log('Updated project with new note:', updatedProject);
    onProjectUpdate(updatedProject);
    setCurrentView('main');
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

  const handleSaveTextNote = async () => {
    if (!textNoteContent.trim()) return;

    setIsSavingTextNote(true);
    try {
      // For text notes, we create them directly without file upload
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('inspection_auth_token')}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          type: 'text',
          content: textNoteContent.trim()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save text note');
      }

      const savedNote = await response.json();
      
      const note: Note = {
        id: savedNote.id,
        type: 'text',
        content: textNoteContent.trim(),
        timestamp: new Date(),
      };

      handleAddNote(note);
      setTextNoteContent('');
    } catch (error) {
      console.error('Failed to save text note:', error);
      alert('Kunde inte spara anteckning. Försök igen.');
    } finally {
      setIsSavingTextNote(false);
    }
  };

  const handleEmailProject = async () => {
    if (!emailForm.to.trim() || !emailForm.subject.trim()) {
      alert('E-postadress och ämne är obligatoriska');
      return;
    }

    setIsEmailSending(true);
    try {
      const { pdfBuffer, fileName } = await generateProjectPDF(project);
      
      await sendEmailWithPDF(
        emailForm.to.trim(),
        emailForm.subject.trim(),
        pdfBuffer,
        fileName,
        emailForm.message.trim() || undefined,
        project.id
      );

      setEmailSuccess(true);
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailSuccess(false);
        setEmailForm({ to: '', subject: '', message: '' });
      }, 2000);
    } catch (error) {
      console.error('Email sending failed:', error);
      alert('Kunde inte skicka e-post. Försök igen.');
    } finally {
      setIsEmailSending(false);
    }
  };

  const handleNoteAction = (noteId: string, note: Note) => {
    setSelectedNoteId(noteId);
    setSelectedNote(note);
    setShowIndividualModal(true);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('sv-SE', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (currentView === 'camera-photo') {
    return (
      <CameraView
        projectId={project.id}
        mode="photo"
        onBack={() => setCurrentView('main')}
        onSave={handleAddNote}
      />
    );
  }

  if (currentView === 'camera-video') {
    return (
      <CameraView
        projectId={project.id}
        mode="video"
        onBack={() => setCurrentView('main')}
        onSave={handleAddNote}
      />
    );
  }

  if (currentView === 'text-note') {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={() => setCurrentView('main')}
              className="mr-3 p-2 -ml-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Textanteckning</h1>
          </div>
        </div>

        <div className="flex-1 p-4">
          <textarea
            value={textNoteContent}
            onChange={(e) => setTextNoteContent(e.target.value)}
            placeholder="Skriv din anteckning här..."
            className="w-full h-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-lg"
          />
        </div>

        <div className="p-4 bg-white border-t border-gray-200">
          <button
            onClick={handleSaveTextNote}
            disabled={!textNoteContent.trim() || isSavingTextNote}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {isSavingTextNote ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Spara anteckning'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center min-w-0 flex-1">
            <button
              onClick={onBack}
              className="mr-3 p-2 -ml-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h1>
              <p className="text-sm text-gray-500 truncate">{project.location}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={() => setShowEmailModal(true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Mail className="w-5 h-5" />
            </button>
            <button
              onClick={() => exportProjectToPDF(project)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-20">
        {/* AI Summary Section */}
        {project.aiSummary && (
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-b border-gray-200 p-4">
            <div className="flex items-start">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center mr-3 flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 mb-2">AI-Sammanfattning</h3>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {project.aiSummary}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Generate Summary Button */}
        {project.notes.length > 0 && !project.aiSummary && (
          <div className="p-4 border-b border-gray-200">
            <button
              onClick={handleGenerateSummary}
              disabled={isGeneratingSummary}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {isGeneratingSummary ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Genererar sammanfattning...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generera AI-sammanfattning
                </>
              )}
            </button>
          </div>
        )}

        {/* Notes List */}
        <div className="p-4">
          {project.notes.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Inga anteckningar än</h3>
              <p className="text-gray-500">Lägg till foton, videor eller textanteckningar för att komma igång.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {project.notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 flex-shrink-0 ${
                        note.type === 'photo' ? 'bg-green-100' :
                        note.type === 'video' ? 'bg-red-100' : 'bg-blue-100'
                      }`}>
                        {note.type === 'photo' ? (
                          <Camera className={`w-5 h-5 ${note.type === 'photo' ? 'text-green-600' : ''}`} />
                        ) : note.type === 'video' ? (
                          <Video className={`w-5 h-5 ${note.type === 'video' ? 'text-red-600' : ''}`} />
                        ) : (
                          <Type className={`w-5 h-5 ${note.type === 'text' ? 'text-blue-600' : ''}`} />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900 capitalize">
                            {note.type === 'photo' ? 'Foto' : 
                             note.type === 'video' ? 'Video' : 'Text'}
                            {note.fileSize && (
                              <span className="text-gray-500 font-normal ml-2">
                                ({formatFileSize(note.fileSize)})
                              </span>
                            )}
                          </span>
                          <div className="flex items-center space-x-2">
                            {note.submitted && (
                              <CheckCircle className="w-4 h-4 text-green-600" title="Skickad" />
                            )}
                            <button
                              onClick={() => handleNoteAction(note.id, note)}
                              className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                              title="Skicka enskild rapport"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        <p className="text-sm text-gray-700 mb-2 line-clamp-3">
                          {note.transcription || note.content}
                        </p>
                        
                        {note.fileUrl && (
                          <div className="mt-3">
                            {note.type === 'photo' ? (
                              <img 
                                src={note.fileUrl} 
                                alt="Note attachment" 
                                className="w-full max-w-xs h-32 object-cover rounded-lg border border-gray-200"
                              />
                            ) : note.type === 'video' ? (
                              <video 
                                src={note.fileUrl} 
                                className="w-full max-w-xs h-32 object-cover rounded-lg border border-gray-200"
                                controls
                              />
                            ) : null}
                          </div>
                        )}
                        
                        <p className="text-xs text-gray-500 mt-2">
                          {formatDate(note.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fixed Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-area-pb">
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setCurrentView('camera-photo')}
            className="flex flex-col items-center justify-center py-3 px-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors"
          >
            <Camera className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Foto</span>
          </button>
          
          <button
            onClick={() => setCurrentView('camera-video')}
            className="flex flex-col items-center justify-center py-3 px-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
          >
            <Video className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Video</span>
          </button>
          
          <button
            onClick={() => setCurrentView('text-note')}
            className="flex flex-col items-center justify-center py-3 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Type className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Text</span>
          </button>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Skicka rapport</h2>
              <button
                onClick={() => setShowEmailModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ×
              </button>
            </div>

            {emailSuccess ? (
              <div className="p-6 text-center">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Rapport skickad!</h3>
                <p className="text-gray-600">E-posten har skickats till {emailForm.to}</p>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    E-postadress
                  </label>
                  <input
                    type="email"
                    value={emailForm.to}
                    onChange={(e) => setEmailForm(prev => ({ ...prev, to: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="mottagare@email.se"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ämne
                  </label>
                  <input
                    type="text"
                    value={emailForm.subject}
                    onChange={(e) => setEmailForm(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Inspektionsrapport"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meddelande (valfritt)
                  </label>
                  <textarea
                    value={emailForm.message}
                    onChange={(e) => setEmailForm(prev => ({ ...prev, message: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Lägg till ett meddelande..."
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setShowEmailModal(false)}
                    className="flex-1 px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleEmailProject}
                    disabled={isEmailSending || !emailForm.to.trim() || !emailForm.subject.trim()}
                    className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    {isEmailSending ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Skicka'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Individual Report Modal */}
      {showIndividualModal && selectedNoteId && selectedNote && (
        <IndividualReportModal
          noteId={selectedNoteId}
          note={selectedNote}
          onClose={() => {
            setShowIndividualModal(false);
            setSelectedNoteId(null);
            setSelectedNote(null);
          }}
        />
      )}
    </div>
  );
};