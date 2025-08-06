import React, { useState } from 'react';
import { X, Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { sendEmailWithAttachment } from '../utils/api';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  imageCaption: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export const EmailModal: React.FC<EmailModalProps> = ({
  isOpen,
  onClose,
  projectName,
  imageCaption,
  fileUrl,
  fileName,
  fileType,
  fileSize
}) => {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(projectName);
  const [message, setMessage] = useState(imageCaption);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !subject.trim()) {
      setError('E-postadress och ämne är obligatoriska');
      return;
    }

    setIsSubmitting(true);
    setError('');
    
    try {
      await sendEmailWithAttachment(
        email.trim(),
        subject.trim(),
        message.trim(),
        fileUrl,
        fileName,
        fileType,
        fileSize
      );
      
      setSuccess(true);
      
      // Auto-close after success
      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (error) {
      console.error('Failed to send email:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte skicka e-post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Skicka rapport</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Success State */}
          {success && (
            <div className="p-6">
              <div className="text-center">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">E-post skickad!</h3>
                <p className="text-gray-600">Rapporten har skickats till {email}</p>
              </div>
            </div>
          )}

          {/* Form */}
          {!success && (
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Meddelande..."
                  disabled={isSubmitting}
                />
              </div>

              {/* File info */}
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-blue-800 text-sm">
                  📎 Bifogad fil: {fileName}
                </p>
                <p className="text-blue-600 text-xs">
                  {fileType} • {(fileSize / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim() || !subject.trim()}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                >
                  {isSubmitting ? (
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
            </form>
          )}
        </div>
      </div>
    </div>
  );
};