import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, X, Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Note } from '../types';
import { sendEmailWithPDF, sendEmailWithAttachment } from '../utils/api';
import { CameraView } from './CameraView';
import { NoteModal } from './NoteModal';

interface ProjectDetailProps {
  project: { id: string; name: string; [key: string]: any };
  onBack: () => void;
  onProjectUpdate: (project: any) => void;
  onProjectDelete: () => void;
  pendingEmailData?: any;
  onEmailDataProcessed?: () => void;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ 
  project, 
  onBack, 
  onProjectUpdate, 
  onProjectDelete,
  pendingEmailData,
  onEmailDataProcessed
}) => {
  const [currentView, setCurrentView] = useState<'detail' | 'camera-photo' | 'camera-video'>('detail');
  const [showModal, setShowModal] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailData, setEmailData] = useState<any>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailCallCount, setEmailCallCount] = useState(0);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);

  // Show modal when pendingEmailData is available
  useEffect(() => {
    console.log('useEffect triggered with pendingEmailData:', pendingEmailData);
    if (pendingEmailData) {
      console.log('Setting up email modal with data:', pendingEmailData);
      setEmailSubject(pendingEmailData.projectName);
      setEmailMessage(pendingEmailData.content);
      setShowModal(true);
      // Clear the pending data
      if (onEmailDataProcessed) {
        console.log('Clearing pending email data');
        onEmailDataProcessed();
      }
    }
  }, [pendingEmailData, onEmailDataProcessed]);

  const handleCameraBack = () => {
    setCurrentView('detail');
  };

  const handleNoteSave = (note: Omit<Note, 'id'>, emailData?: any) => {
    // Add the note to the project and update
    const updatedProject = {
      ...project,
      notes: [...(project.notes || []), { ...note, id: Date.now().toString() }],
      updatedAt: new Date()
    };
    onProjectUpdate(updatedProject);
    
    // Navigate back to project view first
    setCurrentView('detail');
    
    // If email data is provided, set it up for the modal
    if (emailData) {
      setEmailData(emailData);
      setEmailSubject(emailData.projectName || project.name);
      setEmailMessage(emailData.content || '');
      setShowModal(true);
    }
  };

  const handleNoteClick = (note: Note) => {
    setSelectedNote(note);
    setShowNoteModal(true);
  };

  const handleCloseNoteModal = () => {
    setShowNoteModal(false);
    setSelectedNote(null);
  };

  if (currentView === 'camera-photo') {
    return (
      <CameraView
        projectId={project.id}
        mode="photo"
        onBack={handleCameraBack}
        onSave={handleNoteSave}
        projectName={project.name}
      />
    );
  }

  if (currentView === 'camera-video') {
    return (
      <CameraView
        projectId={project.id}
        mode="video"
        onBack={handleCameraBack}
        onSave={handleNoteSave}
        projectName={project.name}
      />
    );
  }

  const handleSendEmail = async () => {
    // Hard limit to prevent infinite recursion
    const currentCallCount = emailCallCount + 1;
    setEmailCallCount(currentCallCount);
    
    if (currentCallCount > 3) {
      console.error('Email sending called too many times, aborting to prevent infinite loop');
      alert('Fel: För många försök att skicka e-post. Försök igen senare.');
      setIsSendingEmail(false);
      setEmailCallCount(0);
      return;
    }
    
    if (!emailRecipient.trim() || !emailSubject.trim()) {
      alert('E-postadress och ämne är obligatoriska');
      setEmailCallCount(0);
      return;
    }

    if (isSendingEmail) {
      console.log('Already sending email, preventing duplicate call');
      setEmailCallCount(0);
      return;
    }

    setIsSendingEmail(true);
    console.log(`=== EMAIL SEND ATTEMPT ${currentCallCount} ===`);
    
    try {
      if (emailData) {
        console.log('Sending email with attachment (attempt', currentCallCount, '):', {
          fileName: emailData.fileName,
          fileType: emailData.fileType,
          fileSize: emailData.fileSize
        });
        // Send email with file attachment
        await sendEmailWithAttachment(
          emailRecipient.trim(),
          emailSubject.trim(),
          emailMessage.trim(),
          emailData.fileUrl,
          emailData.fileName,
          emailData.fileType,
          emailData.fileSize
        );
        console.log('Email with attachment sent successfully');
      } else {
        console.log('No email data, generating PDF fallback (attempt', currentCallCount, ')');
        
        // Prevent PDF generation for video files to avoid potential loops
        if (emailSubject.toLowerCase().includes('video') || emailMessage.toLowerCase().includes('video')) {
          throw new Error('PDF generation not supported for video content. Please try again with the video attachment.');
        }
        
        const { generateProjectPDF } = await import('../utils/export');
        const mockProject: any = {
          name: emailSubject,
          location: 'Inspektionsplats',
          createdAt: new Date(),
          aiSummary: emailMessage,
          notes: [{
            id: 'mock-note-1',
            type: 'text',
            content: emailMessage,
            transcription: emailMessage,
            timestamp: new Date()
          }]
        };
        
        console.log('Generating PDF for mock project...');
        const { pdfBuffer, fileName } = await generateProjectPDF(mockProject);
        console.log('PDF generated successfully, sending email...');
        
        await sendEmailWithPDF(
          emailRecipient.trim(),
          emailSubject.trim(),
          pdfBuffer,
          fileName,
          emailMessage.trim()
        );
        console.log('Email with PDF sent successfully');
      }
      
      setEmailSuccess(true);
      setEmailCallCount(0); // Reset counter on success
      
      // Auto-close after success
      setTimeout(() => {
        setShowModal(false);
        setEmailSuccess(false);
        setEmailData(null);
        setEmailRecipient('');
        setEmailSubject('');
        setEmailMessage('');
      }, 2000);
      
    } catch (error) {
      console.error('Failed to send email:', error);
      
      // Don't show alert for first few attempts, but do show for final attempt
      if (currentCallCount >= 3) {
        alert('Kunde inte skicka e-post efter flera försök: ' + (error instanceof Error ? error.message : 'Okänt fel'));
        setEmailCallCount(0);
      } else {
        console.log('Email attempt failed, will retry if user clicks again');
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-6">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Project Info */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Projektinformation</h2>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Plats:</span> {project.location}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Datum:</span> {project.date?.toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Inspektör:</span> {project.inspector}
              </p>
            </div>
          </div>

          {/* Camera Actions */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Lägg till dokumentation</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCurrentView('camera-photo')}
                className="flex flex-col items-center p-4 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <div className="w-8 h-8 mb-2">📷</div>
                <span className="text-sm font-medium">Ta foto</span>
              </button>
              <button
                onClick={() => setCurrentView('camera-video')}
                className="flex flex-col items-center p-4 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
              >
                <div className="w-8 h-8 mb-2">🎥</div>
                <span className="text-sm font-medium">Spela in video</span>
              </button>
            </div>
          </div>

          {/* Notes */}
          {project.notes && project.notes.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Anteckningar</h2>
              <div className="space-y-3">
                {project.notes.map((note: Note) => (
                  <div 
                    key={note.id} 
                    onClick={() => handleNoteClick(note)}
                    className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                      <span className="text-sm font-medium text-gray-700">
                        {note.type === 'photo' ? '📷 Foto' : '🎥 Video'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {note.timestamp.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">{note.content}</p>
                    {note.submitted && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                          ✓ Skickad
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Email Modal */}
      {showModal && (
        <div className="fixed inset-0 top-0 left-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Skicka rapport</h2>
              <button
                onClick={() => setShowModal(false)}
                disabled={isSendingEmail}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              {/* Success State */}
              {emailSuccess && (
                <div className="text-center">
                  <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">E-post skickad!</h3>
                  <p className="text-gray-600">Rapporten har skickats till {emailRecipient}</p>
                </div>
              )}

              {/* Form - only show if not in success state */}
              {!emailSuccess && (
                <>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  E-postadress
                </label>
                <input
                  type="email"
                  id="email"
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="mottagare@email.se"
                  required
                  disabled={isSendingEmail}
                />
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                  Ämnesrad
                </label>
                <input
                  type="text"
                  id="subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ämne för e-posten"
                  required
                  disabled={isSendingEmail}
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                  Meddelande
                </label>
                <textarea
                  id="message"
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Meddelande..."
                  disabled={isSendingEmail}
                />
              </div>

                  {/* File info - show if emailData exists */}
                  {emailData && (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-blue-800 text-sm">
                        📎 Bifogad fil: {emailData.fileName}
                      </p>
                      <p className="text-blue-600 text-xs">
                        {emailData.fileType} • {(emailData.fileSize / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                      onClick={() => {
                        setShowModal(false);
                        setEmailData(null);
                        setEmailSuccess(false);
                      }}
                  disabled={isSendingEmail}
                  className="flex-1 px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={isSendingEmail || !emailRecipient.trim() || !emailSubject.trim()}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                >
                  {isSendingEmail ? (
                    <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Skickar...
                    </>
                  ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Skicka
                        </>
                  )}
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {selectedNote && (
        <NoteModal
          note={selectedNote}
          projectName={project.name}
          isOpen={showNoteModal}
          onClose={handleCloseNoteModal}
        />
      )}
    </div>
  );
};