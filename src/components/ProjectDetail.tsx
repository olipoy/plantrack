import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, X, Send, Loader2, CheckCircle, AlertCircle, Check, FileText, Trash2, Mail, ExternalLink, Edit2 } from 'lucide-react';
import { Note, Section } from '../types';
import { sendEmailWithPDF, sendEmailWithAttachment, generateProjectReport, getProjectReports, deleteReport, sendReportEmail } from '../utils/api';
import { CameraView } from './CameraView';
import { NoteModal } from './NoteModal';
import { TextNoteModal } from './TextNoteModal';
import { SectionView } from './SectionView';
import { SectionFieldsForm } from './SectionFieldsForm';
import { EditProjectModal } from './EditProjectModal';
import { loadEmailHistory, saveEmailToHistory, filterEmailHistory } from '../utils/emailHistory';
import { getProjectSections, organizeSectionsHierarchy } from '../utils/sections';
import { safeFormatDate, safeFormatFileSize, safeUrl, isValidUrl } from '../utils/formatters';

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
  const [currentView, setCurrentView] = useState<'detail' | 'camera-photo' | 'camera-video' | 'text-note'>('detail');
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
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const [showEmailDropdown, setShowEmailDropdown] = useState(false);
  const [filteredEmails, setFilteredEmails] = useState<string[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showReportEmailModal, setShowReportEmailModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [reportEmail, setReportEmail] = useState('');
  const [reportEmailSubject, setReportEmailSubject] = useState('');
  const [reportEmailMessage, setReportEmailMessage] = useState('');
  const [isSendingReportEmail, setIsSendingReportEmail] = useState(false);
  const [reportEmailSuccess, setReportEmailSuccess] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoadingSections, setIsLoadingSections] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);

  // Load email history when modal is shown
  React.useEffect(() => {
    if (showModal) {
      const history = loadEmailHistory();
      setEmailHistory(history);
      setFilteredEmails(history);
    }
  }, [showModal]);

  // Filter emails when input changes
  React.useEffect(() => {
    const filtered = filterEmailHistory(emailRecipient, emailHistory);
    setFilteredEmails(filtered);
  }, [emailRecipient, emailHistory]);

  // Load reports when component mounts
  React.useEffect(() => {
    const loadReports = async () => {
      try {
        const projectReports = await getProjectReports(project.id);
        // Validate reports array before setting state
        const validReports = Array.isArray(projectReports) ? projectReports : [];
        setReports(validReports);
      } catch (error) {
        console.error('Failed to load reports:', error);
        // Set empty array on error to prevent crashes
        setReports([]);
      }
    };

    loadReports();
  }, [project.id]);

  // Load sections if project has a template
  React.useEffect(() => {
    const loadSections = async () => {
      if (project.template === 'besiktningsprotokoll') {
        setIsLoadingSections(true);
        try {
          const projectSections = await getProjectSections(project.id);
          const organizedSections = organizeSectionsHierarchy(projectSections);
          // Validate sections array before setting state
          const validSections = Array.isArray(organizedSections) ? organizedSections : [];
          setSections(validSections);
        } catch (error) {
          console.error('Failed to load sections:', error);
          // Set empty array on error to prevent crashes
          setSections([]);
        } finally {
          setIsLoadingSections(false);
        }
      }
    };

    loadSections();
  }, [project.id, project.template]);

  const handleNoteUpdated = (noteId: string, updates: { kommentar?: string; delomrade?: string }) => {
    console.log('=== handleNoteUpdated called ===');
    console.log('Note ID:', noteId);
    console.log('Updates:', updates);

    // Update the note in local state
    const updatedProject = {
      ...project,
      notes: project.notes.map((note: Note) =>
        note.id === noteId
          ? { ...note, ...updates }
          : note
      ),
      updatedAt: new Date()
    };

    onProjectUpdate(updatedProject);

    // Update the selected note if it's currently displayed
    if (selectedNote && selectedNote.id === noteId) {
      setSelectedNote({ ...selectedNote, ...updates });
    }
  };

  const handleNoteDeleted = (noteId: string) => {
    console.log('=== handleNoteDeleted called ===');
    console.log('Note ID:', noteId);

    // Remove the note from local state
    const updatedProject = {
      ...project,
      notes: project.notes.filter((note: Note) => note.id !== noteId),
      updatedAt: new Date()
    };

    onProjectUpdate(updatedProject);
    setShowNoteModal(false);
    setSelectedNote(null);
  };

  const handleNoteEmailSent = (noteId: string) => {
    console.log('=== handleNoteEmailSent called ===');
    console.log('Note ID:', noteId);
    console.log('Current project notes:', project.notes.map(n => ({ id: n.id, submitted: n.submitted })));

    // Update the note's submitted status in local state
    const updatedProject = {
      ...project,
      notes: project.notes.map((note: Note) =>
        note.id === noteId
          ? { ...note, submitted: true, submittedAt: new Date() }
          : note
      ),
      updatedAt: new Date()
    };

    console.log('Updated project notes:', updatedProject.notes.map(n => ({ id: n.id, submitted: n.submitted })));
    onProjectUpdate(updatedProject);

    // Force reload the project from backend to get the latest database state
    setTimeout(async () => {
      try {
        const { getProjectById } = await import('../utils/api');
        const freshProject = await getProjectById(project.id);
        console.log('Reloaded project from backend:', freshProject.notes?.map(n => ({ id: n.id, submitted: n.submitted })));

        // Convert to frontend format and update
        const formattedProject = {
          ...project,
          notes: (freshProject.notes || []).map((note: any) => ({
            id: note.id,
            type: note.type,
            kommentar: note.kommentar || '',
            transcription: note.transcription,
            imageLabel: note.image_label,
            delomrade: note.delomrade,
            timestamp: new Date(note.created_at),
            submitted: note.submitted || false,
            submittedAt: note.submitted_at ? new Date(note.submitted_at) : undefined,
            individualReport: note.individual_report,
            mediaUrl: note.mediaUrl,
            fileName: note.fileName,
            fileSize: note.fileSize
          })),
          updatedAt: new Date()
        };
        
        onProjectUpdate(formattedProject);
      } catch (error) {
        console.error('Failed to reload project:', error);
      }
    }, 1000); // Wait 1 second for database to be updated
    
    console.log('=== handleNoteEmailSent completed ===');
  };

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

  const handleNoteSave = (note: Note) => {
    console.log('=== handleNoteSave DEBUG ===');
    console.log('Received note:', note);
    console.log('Note ID:', note.id);
    console.log('Note ID type:', typeof note.id);
    console.log('Current project notes count:', project.notes?.length || 0);

    // Check if note already exists in the project to prevent duplicates
    const noteExists = project.notes?.some(existingNote => existingNote.id === note.id);

    if (noteExists) {
      console.log('Note already exists in project, skipping duplicate');
      setCurrentView('detail');
      return;
    }

    const updatedProject = {
      ...project,
      notes: [...(project.notes || []), note],
      updatedAt: new Date()
    };

    console.log('Updated project notes count:', updatedProject.notes.length);
    console.log('Final note being added:', note);
    onProjectUpdate(updatedProject);

    setCurrentView('detail');
  };

  const handleNoteClick = (note: Note) => {
    setSelectedNote(note);
    setShowNoteModal(true);
  };

  const handleCloseNoteModal = () => {
    setShowNoteModal(false);
    setSelectedNote(null);
  };

  const handleUpdateProject = async (updates: any) => {
    const { updateProject } = await import('../utils/api');
    const updatedProject = await updateProject(project.id, updates);

    // Update local project state
    const mergedProject = {
      ...project,
      ...updatedProject,
      date: updatedProject.project_date ? new Date(updatedProject.project_date) : project.date
    };

    onProjectUpdate(mergedProject);
  };

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const result = await generateProjectReport(project.id);
      const updatedReports = await getProjectReports(project.id);

      // Validate reports before setting state
      const validReports = Array.isArray(updatedReports) ? updatedReports : [];
      setReports(validReports);
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert(`Kunde inte skapa rapport: ${error instanceof Error ? error.message : 'Okänt fel'}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Är du säker på att du vill radera denna rapport?')) {
      return;
    }

    try {
      await deleteReport(reportId);
      setReports(reports.filter(r => r.id !== reportId));
    } catch (error) {
      console.error('Failed to delete report:', error);
      alert(`Kunde inte radera rapport: ${error instanceof Error ? error.message : 'Okänt fel'}`);
    }
  };

  const handleOpenReportEmailModal = (report: any) => {
    setSelectedReport(report);
    setReportEmail('');
    setReportEmailSubject(`${project.name} - Inspektionsrapport`);
    setReportEmailMessage('Se bifogad inspektionsrapport.');
    setReportEmailSuccess(false);
    setShowReportEmailModal(true);
  };

  const handleSendReportEmail = async () => {
    if (!selectedReport) return;

    setIsSendingReportEmail(true);
    try {
      await sendReportEmail(
        selectedReport.id,
        reportEmail,
        reportEmailSubject,
        reportEmailMessage
      );
      saveEmailToHistory(reportEmail);
      setReportEmailSuccess(true);
      setTimeout(() => {
        setShowReportEmailModal(false);
        setReportEmailSuccess(false);
        setSelectedReport(null);
      }, 2000);
    } catch (error) {
      console.error('Failed to send report email:', error);
      alert(`Kunde inte skicka e-post: ${error instanceof Error ? error.message : 'Okänt fel'}`);
    } finally {
      setIsSendingReportEmail(false);
    }
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

  if (currentView === 'text-note') {
    return (
      <TextNoteModal
        projectId={project.id}
        projectName={project.name}
        onBack={handleCameraBack}
        onSave={handleNoteSave}
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
      
      // Save email to history
      saveEmailToHistory(emailRecipient);
      
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
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Projektinformation</h2>
              <button
                onClick={() => setShowEditProjectModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                <span>Ändra</span>
              </button>
            </div>
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

          {/* Camera Actions - Hidden for Besiktningsprotokoll template */}
          {project.template !== 'besiktningsprotokoll' && (
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
                  onClick={() => setCurrentView('text-note')}
                  className="flex flex-col items-center p-4 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors"
                >
                  <div className="w-8 h-8 mb-2">📝</div>
                  <span className="text-sm font-medium">Anteckning</span>
                </button>
              </div>
            </div>
          )}

          {/* Sections (for template-based projects) or Notes (for non-template projects) */}
          {project.template === 'besiktningsprotokoll' ? (
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Sektioner</h2>
              {isLoadingSections ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : sections.length > 0 ? (
                <div className="space-y-2">
                  {sections.map((section) => {
                    const hasFields = [
                      'Fastighetsuppgifter',
                      'Byggnadsbeskrivning',
                      'Besiktningsuppgifter',
                      'Besiktningsutlåtande'
                    ].includes(section.name);

                    return (
                      <React.Fragment key={section.id}>
                        {hasFields ? (
                          <SectionFieldsForm
                            sectionId={section.id}
                            sectionName={section.name}
                            projectId={project.id}
                          />
                        ) : (
                          <SectionView
                            section={section}
                            notes={project.notes || []}
                            projectId={project.id}
                            onNoteClick={handleNoteClick}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  Inga sektioner tillgängliga.
                </p>
              )}
            </div>
          ) : (
            project.notes && project.notes.length > 0 && (
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Anteckningar</h2>
                {/* Debug: Log note data */}
                {console.log('=== DEBUG: Project notes data ===', project.notes.map(note => ({
                  id: note.id,
                  type: note.type,
                  submitted: note.submitted,
                  submittedAt: note.submittedAt,
                  content: note.content?.substring(0, 30)
                })))}
                <div className="space-y-3">
                  {project.notes
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map((note: Note) => {
                      const truncateText = (text: string, maxLength: number) => {
                        if (!text) return '';
                        if (text.length <= maxLength) return text;
                        return text.substring(0, maxLength) + '…';
                      };

                      return (
                        <div
                          key={note.id}
                          onClick={() => handleNoteClick(note)}
                          className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors"
                        >
                          {/* Line 1: Media type with icon */}
                          <div className="flex items-center mb-2">
                            <span className="text-sm font-medium text-gray-700">
                              {note.type === 'photo' ? '📷 Foto' : note.type === 'video' ? '🎥 Video' : '📝 Text'}
                            </span>
                            {note.submitted && (
                              <Check className="w-4 h-4 text-green-600 ml-2" />
                            )}
                          </div>

                          {/* Line 2: Delområde (if not empty) */}
                          {note.delomrade && (
                            <p className="text-sm text-gray-700 font-medium mb-1">
                              {note.delomrade}
                            </p>
                          )}

                          {/* Line 3: Kommentar (truncated to 100 chars, if not empty) */}
                          {note.kommentar && (
                            <p className="text-sm text-gray-600 mb-2">
                              {truncateText(note.kommentar, 100)}
                            </p>
                          )}

                          {/* Line 4: Timestamp */}
                          <p className="text-xs text-gray-500">
                            {note.timestamp.toLocaleString()}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )
          )}

          {/* Reports Section */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Rapporter</h2>

            {/* Generate Report Button */}
            <button
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mb-4"
            >
              {isGeneratingReport ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Skapar rapport...
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5 mr-2" />
                  Skapa rapport
                </>
              )}
            </button>

            {/* Reports List */}
            {reports.length > 0 && (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center mb-1">
                          <FileText className="w-4 h-4 text-blue-600 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {report.file_name}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {safeFormatDate(report.created_at, 'sv-SE', 'Okänt datum')}
                        </p>
                        {report.file_size && (
                          <p className="text-xs text-gray-500">
                            {safeFormatFileSize(report.file_size, 'Okänd storlek')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteReport(report.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Radera rapport"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex space-x-2 mt-3">
                      {isValidUrl(report.signed_url) ? (
                        <a
                          href={safeUrl(report.signed_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-sm"
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Visa rapport
                        </a>
                      ) : (
                        <div className="flex-1 flex items-center justify-center px-4 py-2 text-gray-400 border border-gray-300 rounded-lg bg-gray-50 text-sm">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          URL saknas
                        </div>
                      )}
                      <button
                        onClick={() => handleOpenReportEmailModal(report)}
                        className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        <Mail className="w-4 h-4 mr-1" />
                        Skicka via e-post
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {reports.length === 0 && !isGeneratingReport && (
              <p className="text-sm text-gray-500 text-center py-4">
                Inga rapporter skapade ännu.
              </p>
            )}
          </div>
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
                    <div className="relative">
                      <input
                        type="email"
                        id="email"
                        value={emailRecipient}
                        onChange={(e) => setEmailRecipient(e.target.value)}
                        onFocus={() => setShowEmailDropdown(true)}
                        onBlur={() => {
                          // Delay hiding to allow clicking on dropdown items
                          setTimeout(() => setShowEmailDropdown(false), 150);
                        }}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="mottagare@email.se"
                        required
                        disabled={isSendingEmail}
                      />
                      
                      {/* Email History Dropdown */}
                      {showEmailDropdown && filteredEmails.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                          {filteredEmails.map((historyEmail, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => {
                                setEmailRecipient(historyEmail);
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
          onEmailSent={handleNoteEmailSent}
          onNoteUpdated={handleNoteUpdated}
          onNoteDeleted={handleNoteDeleted}
        />
      )}

      {/* Report Email Modal */}
      {showReportEmailModal && selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Skicka rapport</h2>
              <button
                onClick={() => setShowReportEmailModal(false)}
                disabled={isSendingReportEmail}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {reportEmailSuccess ? (
                <div className="text-center">
                  <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">E-post skickad!</h3>
                  <p className="text-gray-600">Rapporten har skickats till {reportEmail}</p>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="reportEmail" className="block text-sm font-medium text-gray-700 mb-2">
                      E-postadress
                    </label>
                    <input
                      type="email"
                      id="reportEmail"
                      value={reportEmail}
                      onChange={(e) => setReportEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="mottagare@email.se"
                      required
                      disabled={isSendingReportEmail}
                    />
                  </div>

                  <div>
                    <label htmlFor="reportEmailSubject" className="block text-sm font-medium text-gray-700 mb-2">
                      Ämnesrad
                    </label>
                    <input
                      type="text"
                      id="reportEmailSubject"
                      value={reportEmailSubject}
                      onChange={(e) => setReportEmailSubject(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ämne för e-posten"
                      required
                      disabled={isSendingReportEmail}
                    />
                  </div>

                  <div>
                    <label htmlFor="reportEmailMessage" className="block text-sm font-medium text-gray-700 mb-2">
                      Meddelande (valfritt)
                    </label>
                    <textarea
                      id="reportEmailMessage"
                      value={reportEmailMessage}
                      onChange={(e) => setReportEmailMessage(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      placeholder="Meddelande..."
                      disabled={isSendingReportEmail}
                    />
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowReportEmailModal(false)}
                      disabled={isSendingReportEmail}
                      className="flex-1 px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                    >
                      Avbryt
                    </button>
                    <button
                      onClick={handleSendReportEmail}
                      disabled={isSendingReportEmail || !reportEmail.trim() || !reportEmailSubject.trim()}
                      className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                    >
                      {isSendingReportEmail ? (
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

      {/* Edit Project Modal */}
      <EditProjectModal
        project={project}
        isOpen={showEditProjectModal}
        onClose={() => setShowEditProjectModal(false)}
        onSave={handleUpdateProject}
      />
    </div>
  );
};