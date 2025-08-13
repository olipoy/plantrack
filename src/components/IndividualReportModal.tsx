import React, { useState, useEffect } from 'react';
import { X, Send, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Note } from '../types';
import { generateIndividualReport, submitIndividualReport } from '../utils/api';
import { loadEmailHistory, saveEmailToHistory, filterEmailHistory } from '../utils/emailHistory';

interface IndividualReportModalProps {
  noteId: string;
  note: Note;
  onClose: () => void;
}

export const IndividualReportModal: React.FC<IndividualReportModalProps> = ({
  noteId,
  note,
  onClose
}) => {
  const [report, setReport] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Email form state
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [showEmailDropdown, setShowEmailDropdown] = useState(false);
  const [filteredEmails, setFilteredEmails] = useState<string[]>([]);

  useEffect(() => {
    // Auto-generate report when modal opens
    generateReport();
    
    // Set default subject
    setSubject(`Inspektionsrapport - Enskild post - ${new Date().toLocaleDateString('sv-SE')}`);
    
    // Load email history
    const history = loadEmailHistory();
    setEmailHistory(history);
    setFilteredEmails(history);
  }, [noteId]);

  // Filter emails when input changes
  useEffect(() => {
    const filtered = filterEmailHistory(email, emailHistory);
    setFilteredEmails(filtered);
  }, [email, emailHistory]);

  const generateReport = async () => {
    setIsGenerating(true);
    setError('');
    
    try {
      const response = await generateIndividualReport(noteId);
      setReport(response.report);
    } catch (error) {
      console.error('Failed to generate report:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte generera rapport');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !subject.trim()) {
      setError('E-postadress och ämne är obligatoriska');
      return;
    }

    setIsSubmitting(true);
    setError('');
    
    try {
      await submitIndividualReport(noteId, email.trim(), subject.trim(), customMessage.trim() || undefined);
      setSuccess(true);
      
      // Save email to history
      saveEmailToHistory(email);
      
      // Auto-close after success
      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (error) {
      console.error('Failed to submit report:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte skicka rapport');
    } finally {
      setIsSubmitting(false);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <FileText className="w-6 h-6 text-blue-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Skicka enskild rapport</h2>
              <p className="text-sm text-gray-500">
                {formatNoteType(note.type)} • {note.timestamp.toLocaleDateString('sv-SE')}
              </p>
            </div>
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
          {success && (
            <div className="p-6">
              <div className="text-center">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Rapport skickad!</h3>
                <p className="text-gray-600">Rapporten har skickats till {email}</p>
              </div>
            </div>
          )}

          {/* Main Content */}
          {!success && (
            <>
              {/* Generated Report Section */}
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Genererad rapport</h3>
                
                {isGenerating ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin mr-2" />
                    <span className="text-gray-600">Genererar rapport...</span>
                  </div>
                ) : report ? (
                  <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                      {report}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <button
                      onClick={generateReport}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Försök generera rapport igen
                    </button>
                  </div>
                )}
              </div>

              {/* Email Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                  />
                </div>

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
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                    Meddelande (valfritt)
                  </label>
                  <textarea
                    id="message"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Lägg till ett personligt meddelande..."
                  />
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
                    onClick={onClose}
                    className="flex-1 px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Avbryt
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !report || !email.trim() || !subject.trim()}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};