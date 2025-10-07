import React, { useState } from 'react';
import { X, Send, Loader2, CheckCircle, AlertCircle, Play, Share2, Copy, Edit2, Trash2, Save } from 'lucide-react';
import { Note } from '../types';
import { createNoteShare, updateNoteDetails, deleteNote } from '../utils/api';
import { loadEmailHistory, saveEmailToHistory, filterEmailHistory } from '../utils/emailHistory';

interface NoteModalProps {
  note: Note;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onEmailSent?: (noteId: string) => void;
  onNoteUpdated?: (noteId: string, updates: { kommentar?: string; delomrade?: string }) => void;
  onNoteDeleted?: (noteId: string) => void;
}

export const NoteModal: React.FC<NoteModalProps> = ({
  note,
  projectName,
  isOpen,
  onClose,
  onEmailSent,
  onNoteUpdated,
  onNoteDeleted
}) => {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(`${projectName} - ${note.type === 'photo' ? 'Foto' : 'Video'}`);
  const [message, setMessage] = useState(note.content || '');
  const [isSending, setIsSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [showEmailDropdown, setShowEmailDropdown] = useState(false);
  const [filteredEmails, setFilteredEmails] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editableKommentar, setEditableKommentar] = useState(note.kommentar || '');
  const [editableDelomrade, setEditableDelomrade] = useState(note.delomrade || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load email history when email form is shown
  React.useEffect(() => {
    if (showEmailForm) {
      const history = loadEmailHistory();
      setEmailHistory(history);
      setFilteredEmails(history);
    }
  }, [showEmailForm]);

  // Filter emails when input changes
  React.useEffect(() => {
    const filtered = filterEmailHistory(email, emailHistory);
    setFilteredEmails(filtered);
  }, [email, emailHistory]);

  if (!isOpen) return null;

  const handleSendEmail = async () => {
    if (!email.trim() || !subject.trim()) {
      setError('E-postadress och ämne är obligatoriska');
      return;
    }

    if (!note.id) {
      setError('Antecknings-ID saknas');
      return;
    }

    setIsSending(true);
    setError('');

    try {
      const token = localStorage.getItem('inspection_auth_token');
      const response = await fetch('/api/send-email-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          noteId: note.id
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to send email: ${response.statusText}`);
      }

      setEmailSuccess(true);
      
      // Notify parent that email was sent successfully
      if (onEmailSent) {
        onEmailSent(note.id);
      }
      
      // Save email to history
      saveEmailToHistory(email);
      
      // Auto-close after success
      setTimeout(() => {
        setEmailSuccess(false);
        setShowEmailForm(false);
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Failed to send email:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte skicka e-post');
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateShare = async () => {
    setIsCreatingShare(true);
    setError('');
    
    try {
      const response = await createNoteShare(note.id);
      setShareUrl(response.url);
      setShareSuccess(true);
    } catch (error) {
      console.error('Failed to create share:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte skapa delningslänk');
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy URL:', error);
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

  const getDisplayKommentar = () => {
    return note.kommentar || '';
  };

  const handleSaveEdit = async () => {
    if (!note.id) {
      setError('Antecknings-ID saknas');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await updateNoteDetails(note.id, {
        kommentar: editableKommentar,
        delomrade: editableDelomrade
      });

      if (onNoteUpdated) {
        onNoteUpdated(note.id, {
          kommentar: editableKommentar,
          delomrade: editableDelomrade
        });
      }

      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save note:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte spara ändringar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditableKommentar(note.kommentar || '');
    setEditableDelomrade(note.delomrade || '');
    setIsEditing(false);
    setError('');
  };

  const handleDelete = async () => {
    if (!note.id) {
      setError('Antecknings-ID saknas');
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      await deleteNote(note.id);

      if (onNoteDeleted) {
        onNoteDeleted(note.id);
      }

      onClose();
    } catch (error) {
      console.error('Failed to delete note:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte radera anteckning');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
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
          <div className="flex items-center space-x-2">
            {!isEditing && !showDeleteConfirm && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Redigera anteckning"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  title="Radera anteckning"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                {note.mediaUrl ? (
                  <div className="mb-4">
                    {note.type === 'photo' ? (
                      <img
                        src={note.mediaUrl}
                        alt={note.imageLabel || 'Foto'}
                        className="w-full max-h-96 object-contain rounded-lg border border-gray-200"
                      />
                    ) : note.type === 'video' ? (
                      <video
                        src={note.mediaUrl}
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
                ) : (
                  <div className="mb-4 p-8 bg-gray-100 rounded-lg border border-gray-200 text-center">
                    <div className="text-gray-500">
                      <div className="text-4xl mb-2">📄</div>
                      <p className="text-sm">Ingen förhandsvisning – äldre fil</p>
                    </div>
                  </div>
                )}

                {/* Delområde */}
                {(isEditing || note.delomrade) && (
                  <div className={`rounded-lg p-4 mb-4 ${isEditing ? 'bg-white border-2 border-blue-200' : 'bg-blue-50'}`}>
                    <h3 className="text-sm font-medium text-blue-900 mb-2">
                      Delområde
                    </h3>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editableDelomrade}
                        onChange={(e) => setEditableDelomrade(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="T.ex. Kök, Ventilationspump..."
                      />
                    ) : (
                      <p className="text-blue-800">{note.delomrade}</p>
                    )}
                  </div>
                )}

                {/* Kommentar */}
                {(isEditing || getDisplayKommentar()) && (
                  <div className={`rounded-lg p-4 mb-4 ${isEditing ? 'bg-white border-2 border-blue-200' : 'bg-gray-50'}`}>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      Kommentar
                    </h3>
                    {isEditing ? (
                      <textarea
                        value={editableKommentar}
                        onChange={(e) => setEditableKommentar(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        placeholder="Lägg till kommentar..."
                      />
                    ) : (
                      <p className="text-gray-800 whitespace-pre-wrap">{getDisplayKommentar()}</p>
                    )}
                  </div>
                )}

                {/* Edit Action Buttons */}
                {isEditing && (
                  <div className="flex space-x-3 mb-4">
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Avbryt
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Sparar...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Spara ändringar
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Delete Confirmation */}
                {showDeleteConfirm && (
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start mb-3">
                      <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-red-900 mb-1">
                          Radera anteckning?
                        </h3>
                        <p className="text-sm text-red-800">
                          Denna åtgärd kan inte ångras. Anteckningen kommer att raderas permanent.
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Avbryt
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Raderar...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Radera anteckning
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Error Message for Edit/Delete */}
                {error && (isEditing || showDeleteConfirm) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center">
                      <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  </div>
                )}

              </div>

              {/* Email Form or Send Button */}
              {!note.submitted && (
                <div className="p-6">
                  {/* Share Link Section */}
                  {!shareSuccess && (
                    <div className="mb-6">
                      <button
                        onClick={handleCreateShare}
                        disabled={isCreatingShare}
                        className="w-full flex items-center justify-center p-4 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors border border-gray-200"
                      >
                        {isCreatingShare ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Skapar delningslänk...
                          </>
                        ) : (
                          <>
                            <Share2 className="w-4 h-4 mr-2" />
                            Skapa delningslänk
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Share URL Display */}
                  {shareSuccess && shareUrl && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-green-800">Delningslänk skapad</span>
                        <button
                          onClick={handleCopyShareUrl}
                          className="flex items-center text-green-700 hover:text-green-800 text-sm"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Kopiera
                        </button>
                      </div>
                      <p className="text-xs text-green-600 break-all">{shareUrl}</p>
                    </div>
                  )}

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
                        <div className="relative">
                          <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onFocus={() => setShowEmailDropdown(true)}
                            onBlur={() => {
                              // Delay hiding to allow clicking on dropdown items
                              setTimeout(() => setShowEmailDropdown(false), 150);
                            }}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="mottagare@email.se"
                            required
                            disabled={isSending}
                          />
                          
                          {/* Email History Dropdown */}
                          {showEmailDropdown && filteredEmails.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                              {filteredEmails.map((historyEmail, index) => (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => {
                                    setEmail(historyEmail);
                                    setShowEmailDropdown(false);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0 text-sm"
                                >
                                  {historyEmail}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
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
                            📎 {note.type === 'photo' ? 'Foto' : 'Video'}: {note.fileName || 'Okänt filnamn'}
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