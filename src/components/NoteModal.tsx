import React, { useState } from 'react';
import { X, Send, Loader2, CheckCircle, AlertCircle, Play } from 'lucide-react';
import { Note } from '../types';
import { sendEmailWithAttachment } from '../utils/api';

interface NoteModalProps {
  note: Note;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onEmailSent?: (noteId: string) => void;
}

export const NoteModal: React.FC<NoteModalProps> = ({
  note,
  projectName,
  isOpen,
  onClose,
  onEmailSent
}) => {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(`${projectName} - ${note.type === 'photo' ? 'Foto' : 'Video'}`);
  const [message, setMessage] = useState(note.content || '');
  const [isSending, setIsSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSendEmail = async () => {
    if (!email.trim() || !subject.trim()) {
      setError('E-postadress och ämne är obligatoriska');
      return;
    }

    if (!note.fileUrl || !note.fileName) {
      setError('Ingen fil att skicka');
      return;
    }

    setIsSending(true);
    setError('');

    try {
      await sendEmailWithAttachment(
        email.trim(),
        subject.trim(),
        message.trim(),
        note.fileUrl,
        note.fileName,
        note.type === 'photo' ? 'image/jpeg' : 'video/webm',
        note.fileSize || 0,
        note.id
      );

      setEmailSuccess(true);
      
      // Notify parent that email was sent successfully
      if (onEmailSent) {
        console.log('=== NoteModal calling onEmailSent ===');
        console.log('Note ID being sent:', note.id);
        onEmailSent(note.id);
        console.log('=== onEmailSent called ===');
      }
      
      // Auto-close after success
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Failed to send email:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte skicka e-post');
    } finally {
      setIsSending(false);
    }
  };

  const formatNoteType = (type: string) => {
    switch (type) {
      case 'photo': return 'Foto';
      case 'video': return 'Video';
      case 'text': return 'Textanteckning';
      default: return type;
    }
  };

  const getDisplayContent = () => {
    if (note.type === 'photo' && note.imageLabel) {
      return note.imageLabel;
    }
    if (note.type === 'video' && note.transcription) {
      return note.transcription;
    }
    return note.content;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{formatNoteType(note.type)}</h2>
            <p className="text-sm text-gray-500">
              {note.timestamp.toLocaleDateString('sv-SE')} • {note.timestamp.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Success State */}
          {emailSuccess && (
            <div className="p-6">
              <div className="text-center">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">E-post skickad!</h3>
                <p className="text-gray-600">Rapporten har skickats till {email}</p>
              </div>
            </div>
          )}

          {/* Main Content */}
          {!emailSuccess && (
            <>
              {/* Media Display */}
              <div className="p-6 border-b border-gray-200">
                {note.fileUrl && (
                  <div className="mb-4">
                    {note.type === 'photo' ? (
                      <img
                        src={note.fileUrl}
                        alt={note.imageLabel || 'Foto'}
                        className="w-full max-h-96 object-contain rounded-lg border border-gray-200"
                      />
                    ) : note.type === 'video' ? (
                      <video
                        src={note.fileUrl}
                        controls
                        className="w-full max-h-96 rounded-lg border border-gray-200"
                        preload="metadata"
                      >
                        <div className="flex items-center justify-center h-48 bg-gray-100 rounded-lg">
                          <Play className="w-12 h-12 text-gray-400" />
                        </div>
                      </video>
                    ) : null}
                  </div>
                )}

                {/* Content/Transcription */}
                {getDisplayContent() && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      {note.type === 'photo' ? 'Bildtext' : 'Transkription'}
                    </h3>
                    <p className="text-gray-800 whitespace-pre-wrap">{getDisplayContent()}</p>
                  </div>
                )}
              </div>

              {/* Email Form or Send Button */}
              {!note.submitted && (
                <div className="p-6">
                  {!showEmailForm ? (
                    <div className="text-center">
                      <button
                        onClick={() => setShowEmailForm(true)}
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors flex items-center mx-auto"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Skicka via e-post
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Skicka via e-post</h3>
                      
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                          E-postadress
                        </label>
                        <input
                          type="email"
                          id="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="mottagare@email.se"
                          required
                          disabled={isSending}
                        />
                      </div>

                      <div>
                        <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                          Ämnesrad
                        </label>
                        <input
                          type="text"
                          id="subject"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Ämne för e-posten"
                          required
                          disabled={isSending}
                        />
                      </div>

                      <div>
                        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                          Meddelande
                        </label>
                        <textarea
                          id="message"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          rows={3}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          placeholder="Meddelande..."
                          disabled={isSending}
                        />
                      </div>

                      {/* File info */}
                      {note.fileName && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-blue-800 text-sm">
                            📎 Bifogad fil: {note.fileName}
                          </p>
                          {note.fileSize && (
                            <p className="text-blue-600 text-xs">
                              {(note.fileSize / 1024 / 1024).toFixed(1)} MB
                            </p>
                          )}
                        </div>
                      )}

                      {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <div className="flex items-center">
                            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                            <p className="text-sm text-red-800">{error}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex space-x-3">
                        <button
                          onClick={() => setShowEmailForm(false)}
                          disabled={isSending}
                          className="flex-1 px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                        >
                          Avbryt
                        </button>
                        <button
                          onClick={handleSendEmail}
                          disabled={isSending || !email.trim() || !subject.trim()}
                          className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                        >
                          {isSending ? (
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
                    </div>
                  )}
                </div>
              )}

              {/* Already sent message */}
              {note.submitted && (
                <div className="p-6 text-center">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                  <p className="text-gray-600">
                    Denna anteckning har redan skickats via e-post
                    {note.submittedAt && (
                      <span className="block text-sm text-gray-500 mt-1">
                        {note.submittedAt.toLocaleDateString('sv-SE')} • {note.submittedAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};