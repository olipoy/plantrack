import React, { useState } from 'react';
import { Project, Note } from '../types';
import { ArrowLeft, Plus, Camera, Video, Download, Sparkles, AlertCircle, Play, Image, MapPin, Calendar, User, Trash2, MoreVertical, Upload, FileText, X, Mail, Send, CheckCircle, XCircle, Edit3, Eye } from 'lucide-react';
import { CameraView } from './CameraView';
import { exportProjectToPDF, generateProjectPDF } from '../utils/export';
import { generateId } from '../utils/storage';
import { deleteProject as deleteProjectAPI } from '../utils/api';
import { summarizeNotes, sendEmailWithPDF } from '../utils/api';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
  onProjectUpdate: (project: Project) => void;
  onProjectDelete: () => void;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack, onProjectUpdate, onProjectDelete }) => {
  const [showCameraView, setShowCameraView] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState('');
  const [showReportEditor, setShowReportEditor] = useState(false);
  const [editableReport, setEditableReport] = useState('');
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [selectedMedia, setSelectedMedia] = useState<Note | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [emailError, setEmailError] = useState('');
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');

  // Initialize editable report when AI summary exists
  React.useEffect(() => {
    if (project.aiSummary && !editableReport) {
      setEditableReport(project.aiSummary);
    }
  }, [project.aiSummary, editableReport]);

  const handleAddNote = async (note: Omit<Note, 'id'>) => {
    console.log('handleAddNote called with:', note);
    try {
      // Reload project from backend to get updated notes
      console.log('Reloading project from backend after note addition...');
      const updatedProject = await getProjectById(project.id);
      console.log('Updated project data:', updatedProject);
      
      // Convert backend project to frontend format
      const formattedProject: Project = {
        id: updatedProject.id,
        name: updatedProject.name,
        location: updatedProject.location || '',
        date: new Date(updatedProject.project_date || updatedProject.created_at),
        inspector: updatedProject.inspector || '',
        createdAt: new Date(updatedProject.created_at),
        updatedAt: new Date(updatedProject.updated_at || updatedProject.created_at),
        notes: (updatedProject.notes || []).map((note: any) => ({
          id: note.id,
          type: note.type,
          content: note.content,
          transcription: note.transcription,
          timestamp: new Date(note.created_at),
          fileUrl: note.files && note.files.length > 0 ? note.files[0].file_url : undefined,
          fileName: note.files && note.files.length > 0 ? note.files[0].file_name : undefined,
          fileSize: note.files && note.files.length > 0 ? note.files[0].file_size : undefined
        })),
        aiSummary: updatedProject.ai_summary
      };
      
      console.log('Formatted project after reload:', formattedProject);
      console.log('Number of notes after reload:', formattedProject.notes.length);
      
      // Update note count
      formattedProject.noteCount = formattedProject.notes.length;
      
      onProjectUpdate(formattedProject);
    } catch (error) {
      console.error('Error reloading project after note addition:', error);
      // Fallback: add note to current project state
      console.log('Using fallback: adding note to current state');
      const newNote: Note = {
        ...note,
        id: generateId()
      };
      
      const updatedProject = {
        ...project,
        notes: [...project.notes, newNote],
        updatedAt: new Date()
      };
      
      console.log('Fallback updated project:', updatedProject);
      onProjectUpdate(updatedProject);
    }
    setShowCameraView(false);
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
    deleteProjectAPI(project.id)
      .then(() => {
        onProjectDelete();
      })
      .catch(error => {
        console.error('Error deleting project:', error);
        alert('Kunde inte ta bort projekt: ' + (error instanceof Error ? error.message : 'Okänt fel'));
      });
  };

  const handleCreateReport = async () => {
    setIsGeneratingReport(true);
    setReportError('');
    
    try {
      const noteTexts = project.notes.map(note => note.transcription || note.content);
      const response = await summarizeNotes(noteTexts, project.name, project.location);
      
      const updatedProject = { ...project, aiSummary: response.summary };
      onProjectUpdate(updatedProject);
      setEditableReport(response.summary);
      setShowReportEditor(true);
    } catch (error) {
      console.error('Error generating report:', error);
      setReportError('Kunde inte generera rapport. Kontrollera internetanslutningen och försök igen.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleShowReportEditor = () => {
    if (project.aiSummary) {
      setEditableReport(project.aiSummary);
      setShowReportEditor(true);
    }
  };

  const handleOpenEmailModal = () => {
    setEmailAddress('');
    setEmailSubject(`Inspektionsrapport - ${project.name}`);
    setEmailStatus('idle');
    setEmailError('');
    setShowEmailModal(true);
  };

  const handleSendEmail = async () => {
    if (!emailAddress.trim() || !emailSubject.trim()) return;
    
    setIsEmailSending(true);
    setEmailStatus('idle');
    setEmailError('');
    
    try {
      // Generate PDF
      const reportText = editableReport || project.aiSummary || '';
      const { pdfBuffer, fileName } = await generateProjectPDF({
        ...project,
        aiSummary: reportText
      });
      
      // Send email
      await sendEmailWithPDF(
        emailAddress.trim(),
        emailSubject.trim(),
        pdfBuffer,
        fileName
      );
      
      setEmailStatus('success');
      
      // Close modal after success
      setTimeout(() => {
        setShowEmailModal(false);
      }, 2000);
      
    } catch (error) {
      console.error('Error sending email:', error);
      setEmailStatus('error');
      setEmailError(error instanceof Error ? error.message : 'Kunde inte skicka e-post');
    } finally {
      setIsEmailSending(false);
    }
  };

  const handleExport = async () => {
    try {
      const reportText = editableReport || project.aiSummary || '';
      await exportProjectToPDF({
        ...project,
        aiSummary: reportText
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  };

  const openCamera = (mode: 'photo' | 'video') => {
    if (project.notes.length >= 20) {
      alert('Du kan ha maximalt 20 anteckningar per projekt.');
      return;
    }
    setCameraMode(mode);
    setShowCameraView(true);
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

  if (showCameraView) {
    return (
      <CameraView
        projectId={project.id}
        mode={cameraMode}
        onBack={() => setShowCameraView(false)}
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
              title="Ladda ner PDF"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={handleOpenEmailModal}
              className="p-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors"
              title="Skicka via e-post"
            >
              <Mail className="w-5 h-5" />
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

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            {emailStatus === 'idle' || emailStatus === 'error' ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Skicka rapport via e-post</h3>
                  <button
                    onClick={() => setShowEmailModal(false)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                    disabled={isEmailSending}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Mottagare
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="exempel@företag.se"
                      required
                      disabled={isEmailSending}
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                      Ämne
                    </label>
                    <input
                      type="text"
                      id="subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      disabled={isEmailSending}
                    />
                  </div>
                  
                  {emailStatus === 'error' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center">
                        <XCircle className="w-5 h-5 text-red-600 mr-2" />
                        <p className="text-sm text-red-800">{emailError}</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">
                      Rapporten kommer att skickas som en PDF-bilaga med alla projektdetaljer, 
                      AI-sammanfattning och anteckningar.
                    </p>
                  </div>
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={() => setShowEmailModal(false)}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                    disabled={isEmailSending}
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleSendEmail}
                    disabled={!emailAddress.trim() || !emailSubject.trim() || isEmailSending}
                    className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    {isEmailSending ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Skicka
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">E-post skickad!</h3>
                <p className="text-gray-600">
                  Rapporten har skickats till {emailAddress}
                </p>
              </div>
            )}
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
        {reportError && (
          <div className="bg-red-50 border-b border-red-200 p-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <p className="text-sm text-red-800">{reportError}</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {/* Report Editor Modal */}
          {showReportEditor && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
              <div className="bg-white rounded-none sm:rounded-xl w-full h-full sm:max-w-4xl sm:w-full sm:max-h-[90vh] sm:h-auto flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Redigera Rapport</h3>
                  <div className="flex items-center space-x-2">
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setPreviewMode('edit')}
                        className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium transition-colors ${
                          previewMode === 'edit'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Edit3 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 inline" />
                        Redigera
                      </button>
                      <button
                        onClick={() => setPreviewMode('preview')}
                        className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-medium transition-colors ${
                          previewMode === 'preview'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1 inline" />
                        Granska
                      </button>
                    </div>
                    <button
                      onClick={() => setShowReportEditor(false)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-hidden">
                  {previewMode === 'edit' ? (
                    <div className="h-full p-3 sm:p-4">
                      <textarea
                        value={editableReport}
                        onChange={(e) => setEditableReport(e.target.value)}
                        className="w-full h-full p-3 sm:p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm sm:text-base"
                        placeholder="Skriv din rapport här..."
                      />
                    </div>
                  ) : (
                    <div className="h-full overflow-y-auto p-2 sm:p-4 bg-gray-50">
                      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-2xl mx-auto shadow-sm mb-4">
                        {/* PDF Header */}
                        <div className="mb-6">
                          <h1 className="text-2xl font-bold text-gray-900 mb-4">Inspektionsrapport</h1>
                          <div className="text-sm text-gray-700 space-y-1 mb-4">
                            <p><strong>Projekt:</strong> {project.name}</p>
                            <p><strong>Plats:</strong> {project.location}</p>
                            <p><strong>Datum:</strong> {project.date.toLocaleDateString('sv-SE')}</p>
                            <p><strong>Inspektör:</strong> {project.inspector}</p>
                          </div>
                          <hr className="border-gray-300 my-4" />
                        </div>
                        
                        {/* AI Summary Section */}
                        {editableReport && (
                          <div className="mb-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-3">AI-Sammanfattning</h2>
                            <div className="text-sm text-gray-800 whitespace-pre-line leading-relaxed bg-gray-50 p-4 rounded-lg border">
                              {editableReport}
                            </div>
                            <hr className="border-gray-300 my-6" />
                          </div>
                        )}
                        
                        {/* Notes Section */}
                        {project.notes.length > 0 && (
                          <div>
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">Anteckningar</h2>
                            <div className="space-y-4">
                              {project.notes.map((note, index) => (
                                <div key={note.id} className="bg-gray-50 p-4 rounded-lg border">
                                  <div className="text-sm text-gray-600 mb-2 font-medium">
                                    {index + 1}. [{note.type.toUpperCase()}] - {note.timestamp.toLocaleString('sv-SE', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                  <div className="text-sm text-gray-800 leading-relaxed">
                                    {note.transcription || note.content}
                                  </div>
                                  {note.fileName && (
                                    <div className="text-xs text-gray-500 mt-2">
                                      Fil: {note.fileName}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Footer */}
                        <div className="mt-8 pt-4 border-t border-gray-300">
                          <div className="text-xs text-gray-500 text-center">
                            Genererad av Inspektionsassistenten - {new Date().toLocaleDateString('sv-SE')}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="border-t border-gray-200 p-4">
                  <div className="flex justify-between items-center">
                    <div className="text-xs sm:text-sm text-gray-500">
                      {editableReport.length} tecken
                    </div>
                    <div className="flex space-x-3">
                      <button
                        onClick={() => setShowReportEditor(false)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                      >
                        Stäng
                      </button>
                      <button
                        onClick={() => {
                          const updatedProject = { ...project, aiSummary: editableReport };
                          onProjectUpdate(updatedProject);
                          setShowReportEditor(false);
                        }}
                        className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg text-sm sm:text-base font-medium hover:bg-blue-700 transition-colors"
                      >
                        Spara Rapport
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {project.aiSummary && !showReportEditor && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <div className="flex items-center mb-3">
                <Sparkles className="w-5 h-5 text-blue-600 mr-2" />
                <div className="flex items-center">
                  <Sparkles className="w-5 h-5 text-blue-600 mr-2" />
                  <h3 className="font-medium text-blue-900">Rapport</h3>
                </div>
                <button
                  onClick={handleShowReportEditor}
                  className="text-blue-600 hover:text-blue-800 p-1"
                  title="Redigera rapport"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
              <div className="text-sm text-blue-800 whitespace-pre-line max-h-64 overflow-y-auto">
                {editableReport || project.aiSummary}
              </div>
            </div>
          )}

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
                        onError={(e) => {
                          console.error('Image failed to load:', note.fileUrl);
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          // Show placeholder
                          const placeholder = target.parentElement?.querySelector('.image-placeholder');
                          if (placeholder) {
                            (placeholder as HTMLElement).style.display = 'flex';
                          }
                        }}
                        onLoad={() => {
                          console.log('Image loaded successfully:', note.fileUrl);
                        }}
                      />
                      <div className="image-placeholder hidden mt-3 bg-gray-100 rounded-lg h-64 flex items-center justify-center">
                        <div className="text-center text-gray-500">
                          <Image className="w-12 h-12 mx-auto mb-2" />
                          <p className="text-sm">Bild kunde inte laddas</p>
                        </div>
                      </div>
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
                        onError={(e) => {
                          console.error('Video failed to load:', note.fileUrl);
                          const target = e.target as HTMLVideoElement;
                          target.style.display = 'none';
                          // Show placeholder
                          const placeholder = target.parentElement?.querySelector('.video-placeholder');
                          if (placeholder) {
                            (placeholder as HTMLElement).style.display = 'flex';
                          }
                        }}
                        onLoadedData={() => {
                          console.log('Video loaded successfully:', note.fileUrl);
                        }}
                      />
                      <div className="video-placeholder hidden bg-gray-100 rounded-lg h-64 flex items-center justify-center">
                        <div className="text-center text-gray-500">
                          <Video className="w-12 h-12 mx-auto mb-2" />
                          <p className="text-sm">Video kunde inte laddas</p>
                        </div>
                      </div>
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
              onClick={handleCreateReport}
              disabled={isGeneratingReport}
              className="w-full bg-teal-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center mb-3"
            >
              {isGeneratingReport ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Skapa Rapport
                </>
              )}
            </button>
          )}
          
          {project.aiSummary && (
            <button
              onClick={handleShowReportEditor}
              className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center mb-3"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Redigera Rapport
            </button>
          )}
          
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => openCamera('photo')}
              disabled={project.notes.length >= 20}
              className="flex flex-col items-center justify-center p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Camera className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">Foto</span>
            </button>
            <button
              onClick={() => openCamera('video')}
              disabled={project.notes.length >= 20}
              className="flex flex-col items-center justify-center p-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Video className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">Video</span>
            </button>
            <label className="flex flex-col items-center justify-center p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors cursor-pointer">
              <Upload className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium text-center leading-tight">Ladda upp</span>
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