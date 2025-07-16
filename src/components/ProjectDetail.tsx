import React, { useState, useEffect } from 'react';
import { Project, Note } from '../types';
import { ArrowLeft, Camera, Video, FileText, Mail, Edit3, Check, X, Sparkles, RotateCcw, Upload, Search } from 'lucide-react';
import { CameraView } from './CameraView';
import { addNoteToProject, deleteNoteFromProject } from '../utils/storage';
import { summarizeNotes, sendEmailWithPDF } from '../utils/api';
import { exportProjectToPDF, generateProjectPDF } from '../utils/export';
import { updateNoteLabel } from '../utils/api';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
  onProjectUpdate: (project: Project) => void;
  onProjectDelete: () => void;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  onBack,
  onProjectUpdate,
  onProjectDelete
}) => {
  const [currentView, setCurrentView] = useState<'detail' | 'camera'>('detail');
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editedReportText, setEditedReportText] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [newTextNote, setNewTextNote] = useState('');
  const [isAddingTextNote, setIsAddingTextNote] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');

  const handleCameraCapture = (note: Omit<Note, 'id'>) => {
    console.log('Camera capture completed, adding note:', note);
    const updatedProjects = addNoteToProject(project.id, note);
    const updatedProject = updatedProjects.find(p => p.id === project.id);
    if (updatedProject) {
      console.log('Project updated with new note:', updatedProject);
      onProjectUpdate(updatedProject);
    }
    setCurrentView('detail');
  };

  const handleDeleteNote = (noteId: string) => {
    const updatedProjects = deleteNoteFromProject(project.id, noteId);
    const updatedProject = updatedProjects.find(p => p.id === project.id);
    if (updatedProject) {
      onProjectUpdate(updatedProject);
    }
  };

  const handleGenerateSummary = async () => {
    if (project.notes.length === 0) {
      alert('Lägg till anteckningar innan du skapar en rapport.');
      return;
    }

    setIsGeneratingSummary(true);
    try {
      console.log('Generating summary for project:', project.id);
      const response = await summarizeNotes(project.id);
      console.log('Summary response:', response);
      
      const updatedProject = { ...project, aiSummary: response.summary };
      onProjectUpdate(updatedProject);
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Kunde inte skapa rapport. Kontrollera internetanslutningen och försök igen.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleEditReport = () => {
    setEditedReportText(project.aiSummary || '');
    setShowEditModal(true);
    setShowReportModal(false);
  };

  const handleSaveReport = () => {
    const updatedProject = { ...project, aiSummary: editedReportText };
    onProjectUpdate(updatedProject);
    setShowEditModal(false);
  };

  const handlePreviewReport = () => {
    setShowReportModal(true);
  };

  const handleCancelEditReport = () => {
    setShowEditModal(false);
    setEditedReportText('');
  };

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;

      for (const file of Array.from(files)) {
        try {
          const note: Omit<Note, 'id'> = {
            type: file.type.startsWith('image/') ? 'photo' : 'video',
            content: file.type.startsWith('image/') ? 'Uppladdad bild' : 'Uppladdad video',
            timestamp: new Date(),
            fileUrl: URL.createObjectURL(file),
            fileName: file.name,
            fileSize: file.size
          };
          
          const updatedProjects = addNoteToProject(project.id, note);
          const updatedProject = updatedProjects.find(p => p.id === project.id);
          if (updatedProject) {
            onProjectUpdate(updatedProject);
          }
        } catch (error) {
          console.error('Error uploading file:', error);
          alert('Kunde inte ladda upp fil. Försök igen.');
        }
      }
    };
    input.click();
  };

  const handleSendEmail = async () => {
    if (!emailAddress.trim()) {
      alert('Ange en e-postadress');
      return;
    }

    setIsSendingEmail(true);
    try {
      const { pdfBuffer, fileName } = await generateProjectPDF(project);
      await sendEmailWithPDF(
        emailAddress,
        `Inspektionsrapport - ${project.name}`,
        pdfBuffer,
        fileName,
        `Inspektionsrapport för ${project.name} på ${project.location}`
      );
      
      alert('Rapporten har skickats!');
      setShowEmailModal(false);
      setEmailAddress('');
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Kunde inte skicka e-post. Försök igen.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleAddTextNote = async () => {
    if (!newTextNote.trim()) return;

    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('inspection_auth_token')}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          type: 'text',
          content: newTextNote.trim()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create note');
      }

      const note = await response.json();
      
      // Add note to project and update
      const newNote: Note = {
        id: note.id,
        type: 'text',
        content: newTextNote.trim(),
        timestamp: new Date(),
      };

      const updatedProject = {
        ...project,
        notes: [newNote, ...project.notes],
        updatedAt: new Date()
      };

      onProjectUpdate(updatedProject);
      setNewTextNote('');
      setIsAddingTextNote(false);
    } catch (error) {
      console.error('Error adding text note:', error);
      alert('Kunde inte lägga till anteckning. Försök igen.');
    }
  };

  const handleEditLabel = (noteId: string, currentLabel: string) => {
    setEditingLabelId(noteId);
    setEditingLabelValue(currentLabel);
  };

  const handleSaveLabel = async (noteId: string) => {
    try {
      await updateNoteLabel(noteId, editingLabelValue.trim());
      
      // Update the note in the project
      const updatedNotes = project.notes.map(note => 
        note.id === noteId 
          ? { ...note, imageLabel: editingLabelValue.trim() }
          : note
      );
      
      const updatedProject = {
        ...project,
        notes: updatedNotes,
        updatedAt: new Date()
      };
      
      onProjectUpdate(updatedProject);
      setEditingLabelId(null);
      setEditingLabelValue('');
    } catch (error) {
      console.error('Error updating label:', error);
      alert('Kunde inte uppdatera etiketten. Försök igen.');
    }
  };

  const handleCancelEdit = () => {
    setEditingLabelId(null);
    setEditingLabelValue('');
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (currentView === 'camera') {
    return (
      <CameraView
        projectId={project.id}
        mode={cameraMode}
        onBack={() => setCurrentView('detail')}
        onSave={handleCameraCapture}
      />
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
            <h1 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h1>
          </div>
        </div>
      </div>

      {/* AI Summary Section - Only action buttons, no content */}
      {project.aiSummary && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
          <div className="p-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">AI-Rapport</h3>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleEditReport}
                  className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center"
                  title="Redigera rapport"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleGenerateSummary}
                  disabled={isGeneratingSummary || project.notes.length === 0}
                  className="p-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center"
                  title="Uppdatera rapport"
                >
                  {isGeneratingSummary ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={handlePreviewReport}
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                  title="Förhandsgranska PDF"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowEmailModal(true)}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
                  title="Skicka via e-post"
                >
                  <Mail className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Notes Section */}
        <div className="p-4">
          {/* Add Text Note */}
          {isAddingTextNote ? (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 mb-4">
              <textarea
                value={newTextNote}
                onChange={(e) => setNewTextNote(e.target.value)}
                placeholder="Skriv din anteckning här..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end space-x-2 mt-3">
                <button
                  onClick={() => {
                    setIsAddingTextNote(false);
                    setNewTextNote('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleAddTextNote}
                  disabled={!newTextNote.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Spara
                </button>
              </div>
            </div>
          ) : null}

          {/* Notes List */}
          <div className="space-y-4">
            {project.notes.map((note) => (
              <div key={note.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3 ${
                      note.type === 'photo' ? 'bg-blue-100' :
                      note.type === 'video' ? 'bg-red-100' : 'bg-gray-100'
                    }`}>
                      {note.type === 'photo' ? (
                        <Camera className={`w-5 h-5 ${note.type === 'photo' ? 'text-blue-600' : ''}`} />
                      ) : note.type === 'video' ? (
                        <Video className={`w-5 h-5 ${note.type === 'video' ? 'text-red-600' : ''}`} />
                      ) : (
                        <FileText className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center">
                        <span className="font-medium text-gray-900 capitalize">
                          {note.type === 'photo' ? 'Photo' : note.type === 'video' ? 'Video' : 'Text'}
                        </span>
                        {note.fileSize && (
                          <span className="text-gray-500 text-sm ml-2">
                            ({formatFileSize(note.fileSize)})
                          </span>
                        )}
                      </div>
                      <span className="text-gray-500 text-sm">
                        {formatDate(note.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>

                {note.type === 'photo' && note.imageLabel ? (
                  <div className="mb-3">
                    {editingLabelId === note.id ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={editingLabelValue}
                          onChange={(e) => setEditingLabelValue(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveLabel(note.id);
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveLabel(note.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-medium text-gray-900">{note.imageLabel}</h4>
                        <button
                          onClick={() => handleEditLabel(note.id, note.imageLabel || '')}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : note.type !== 'photo' && (
                  <div className="mb-3">
                    <p className="text-gray-900">{note.content}</p>
                  </div>
                )}

                {/* Media Display */}
                {note.fileUrl && (
                  <div className="mb-3">
                    {note.type === 'photo' ? (
                      <img 
                        src={note.fileUrl} 
                        alt={note.imageLabel || "Uploaded photo"}
                        className="w-full rounded-lg shadow-sm"
                        loading="lazy"
                      />
                    ) : note.type === 'video' ? (
                      <video 
                        src={note.fileUrl} 
                        controls 
                        className="w-full rounded-lg shadow-sm"
                        preload="metadata"
                        onError={(e) => {
                          console.error('Video loading error:', e);
                          console.error('Video URL:', note.fileUrl);
                        }}
                      >
                        Din webbläsare stöder inte videouppspelning.
                      </video>
                    ) : null}
                  </div>
                )}

                {/* Transcription */}
                {note.transcription && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-700 text-sm italic">"{note.transcription}"</p>
                  </div>
                )}
              </div>
            ))}

            {project.notes.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Inga anteckningar än</h3>
                <p className="text-gray-500">Lägg till foton, videor eller textanteckningar för att komma igång.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate Report Button - Only show if no summary exists */}
      {!project.aiSummary && project.notes.length > 0 && (
        <div className="p-4 bg-white border-t border-gray-200">
          <button
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center"
          >
            {isGeneratingSummary ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <Sparkles className="w-5 h-5 mr-2" />
            )}
            {isGeneratingSummary ? 'Skapar rapport...' : 'Skapa Rapport'}
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={() => {
              setCameraMode('photo');
              setCurrentView('camera');
            }}
            className="flex flex-col items-center justify-center p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors active:scale-98 aspect-square"
          >
            <Camera className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">Foto</span>
          </button>
          
          <button
            onClick={() => {
              setCameraMode('video');
              setCurrentView('camera');
            }}
            className="flex flex-col items-center justify-center p-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors active:scale-98 aspect-square"
          >
            <Video className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">Video</span>
          </button>
          
          <button
            onClick={handleFileUpload}
            className="flex flex-col items-center justify-center p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors active:scale-98 aspect-square"
          >
            <Upload className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">Ladda upp</span>
          </button>
          
          <button
            onClick={() => setIsAddingTextNote(true)}
            className="flex flex-col items-center justify-center p-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors active:scale-98 aspect-square"
          >
            <FileText className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">Text</span>
          </button>
        </div>
      </div>

      {/* Report Preview Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">AI-Rapport</h3>
              <div className="flex space-x-2">
                <button
                  onClick={() => exportProjectToPDF(project)}
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  title="Ladda ner PDF"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-700">{project.aiSummary}</div>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Skicka rapport via e-post</h3>
            <input
              type="email"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder="E-postadress"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            />
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setEmailAddress('');
                }}
                className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleSendEmail}
                disabled={isSendingEmail || !emailAddress.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {isSendingEmail ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Skicka'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Report Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Redigera rapport</h3>
            <textarea
              value={editedReportText}
              onChange={(e) => setEditedReportText(e.target.value)}
              className="w-full h-64 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Redigera rapporten här..."
              rows={15}
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={handleCancelEditReport}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleSaveReport}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Spara
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};