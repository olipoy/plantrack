import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Trash2, Camera, Mic, FileText, X, Check } from 'lucide-react';
import { getSubsectionNotes, createTextNoteForSubsection, deleteSubsection, uploadFile } from '../utils/api';
import { Note } from '../types';

interface SubsectionItemProps {
  subsection: {
    id: string;
    name: string;
    section_id: string;
  };
  projectId: string;
  onDelete: () => void;
  onNoteClick: (note: Note) => void;
}

export const SubsectionItem: React.FC<SubsectionItemProps> = ({
  subsection,
  projectId,
  onDelete,
  onNoteClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingText, setIsSavingText] = useState(false);
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoComment, setPhotoComment] = useState('');
  const [isRecordingPhotoVoice, setIsRecordingPhotoVoice] = useState(false);
  const [photoVoiceRecordingTime, setPhotoVoiceRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceAudioFile, setVoiceAudioFile] = useState<File | null>(null);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const voiceRecorderRef = React.useRef<MediaRecorder | null>(null);
  const voiceChunksRef = React.useRef<Blob[]>([]);
  const voiceIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isExpanded) {
      loadNotes();
    }
  }, [isExpanded, subsection.id]);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const data = await getSubsectionNotes(subsection.id);
      setNotes(data);
    } catch (err) {
      console.error('Failed to load subsection notes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Är du säker på att du vill ta bort "${subsection.name}"?`)) {
      return;
    }
    try {
      await deleteSubsection(subsection.id);
      onDelete();
    } catch (err) {
      console.error('Failed to delete subsection:', err);
      alert('Kunde inte ta bort delområde');
    }
  };

  const handleTextNoteSave = async () => {
    const trimmedContent = textContent.trim();
    if (!trimmedContent) return;

    setIsSavingText(true);
    try {
      await createTextNoteForSubsection(projectId, subsection.id, trimmedContent);
      setTextContent('');
      setShowTextInput(false);
      await loadNotes();
    } catch (err) {
      console.error('Failed to create text note:', err);
      alert('Kunde inte skapa anteckning');
    } finally {
      setIsSavingText(false);
    }
  };

  const handleTextInputCancel = () => {
    setTextContent('');
    setShowTextInput(false);
  };

  const handleTextInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextNoteSave();
    } else if (e.key === 'Escape') {
      handleTextInputCancel();
    }
  };

  const initializeCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 640, max: 854 },
          height: { ideal: 480, max: 480 }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Camera initialization failed:', error);
      alert('Kunde inte komma åt kameran. Kontrollera att du har gett tillåtelse.');
    }
  };

  const cleanupCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
  };

  const handleOpenCamera = async () => {
    setShowCameraPreview(true);
    // Small delay to ensure the video element is rendered
    setTimeout(() => {
      initializeCamera();
    }, 100);
  };

  const handleTakePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          setCapturedPhoto(blob);
          const url = URL.createObjectURL(blob);
          setPhotoPreviewUrl(url);
          cleanupCamera();
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const handleCancelCamera = () => {
    cleanupCamera();
    setShowCameraPreview(false);
    setCapturedPhoto(null);
  };

  const handleCancelPhotoPreview = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setCapturedPhoto(null);
    setPhotoPreviewUrl(null);
    setPhotoComment('');
    setShowCameraPreview(false);
    setIsRecordingPhotoVoice(false);
    setIsTranscribing(false);
    setVoiceAudioFile(null);
    voiceChunksRef.current = [];
    if (voiceIntervalRef.current) {
      clearInterval(voiceIntervalRef.current);
    }
    if (voiceRecorderRef.current?.stream) {
      voiceRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleStartPhotoVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceChunksRef.current = [];
      voiceRecorderRef.current = new MediaRecorder(stream);

      voiceRecorderRef.current.ondataavailable = (e) => {
        voiceChunksRef.current.push(e.data);
      };

      voiceRecorderRef.current.start();
      setIsRecordingPhotoVoice(true);
      setPhotoVoiceRecordingTime(0);

      voiceIntervalRef.current = setInterval(() => {
        setPhotoVoiceRecordingTime((prev) => prev + 1);
      }, 1000);

      setTimeout(() => {
        if (voiceRecorderRef.current?.state === 'recording') {
          handleStopPhotoVoiceRecording();
        }
      }, 30000);
    } catch (err) {
      console.error('Failed to start voice recording:', err);
      alert('Kunde inte spela in ljud');
    }
  };

  const handleStopPhotoVoiceRecording = async () => {
    if (voiceRecorderRef.current && voiceRecorderRef.current.state === 'recording') {
      voiceRecorderRef.current.onstop = async () => {
        const voiceBlob = new Blob(voiceChunksRef.current, { type: 'audio/webm' });
        const voiceFile = new File([voiceBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });

        // Store the audio file for later upload
        setVoiceAudioFile(voiceFile);

        // Show transcribing message
        setIsTranscribing(true);
        setPhotoComment('Transkriberar...');

        try {
          // Transcribe the voice
          const { transcribeAudio } = await import('../utils/api');
          const transcriptionResult = await transcribeAudio(voiceFile);

          // Extract transcription text if it's an object
          const transcriptionText = typeof transcriptionResult === 'string'
            ? transcriptionResult
            : (transcriptionResult?.text || transcriptionResult?.transcription || '');

          // Insert transcription into comment field
          setPhotoComment(transcriptionText || '');
        } catch (err) {
          console.error('Transcription failed:', err);
          setPhotoComment('');
          alert('Kunde inte transkribera röst');
        } finally {
          setIsTranscribing(false);
        }

        // Clean up stream
        if (voiceRecorderRef.current?.stream) {
          voiceRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
      };

      voiceRecorderRef.current.stop();
      setIsRecordingPhotoVoice(false);
      if (voiceIntervalRef.current) {
        clearInterval(voiceIntervalRef.current);
      }
    }
  };

  const handleTogglePhotoVoiceRecording = () => {
    if (isRecordingPhotoVoice) {
      handleStopPhotoVoiceRecording();
    } else {
      handleStartPhotoVoiceRecording();
    }
  };

  const handleSavePhoto = async () => {
    if (!capturedPhoto) return;

    setIsUploading(true);
    try {
      const fileName = `photo_${Date.now()}.jpg`;
      const photoFile = new File([capturedPhoto], fileName, { type: 'image/jpeg' });

      // Upload photo
      const response = await uploadFile(photoFile, projectId, 'photo', undefined, subsection.id);

      // Update the photo note with the comment (text or transcription)
      if (photoComment) {
        const { updateNoteDetails } = await import('../utils/api');
        await updateNoteDetails(response.noteId, {
          kommentar: photoComment,
          imageLabel: response.imageLabel
        });
      }

      // Reset and reload
      setVoiceAudioFile(null);
      voiceChunksRef.current = [];
      handleCancelPhotoPreview();
      await loadNotes();
    } catch (err) {
      console.error('Failed to save photo:', err);
      alert('Kunde inte spara foto');
    } finally {
      setIsUploading(false);
    }
  };

  const handleVoiceRecording = async () => {
    try {
      setIsRecording(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], 'voice-note.webm', { type: 'audio/webm' });

        setIsRecording(false);
        setIsUploading(true);
        try {
          await uploadFile(file, projectId, 'text', undefined, subsection.id);
          await loadNotes();
        } catch (err) {
          console.error('Failed to upload voice note:', err);
          alert('Kunde inte ladda upp röstanteckning');
        } finally {
          setIsUploading(false);
        }

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 30000);

      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 5000);
    } catch (err) {
      console.error('Failed to record voice:', err);
      alert('Kunde inte spela in ljud');
      setIsRecording(false);
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '…';
  };

  return (
    <>
      <div className="bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center flex-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mr-2 text-gray-600 hover:text-gray-900"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <span className="text-sm font-medium text-gray-700">{subsection.name}</span>
            {notes.length > 0 && (
              <span className="ml-2 text-xs text-gray-500">
                ({notes.length} {notes.length === 1 ? 'anteckning' : 'anteckningar'})
              </span>
            )}
          </div>
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-red-600 transition-colors p-1"
            aria-label="Ta bort delområde"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {isExpanded && (
          <div className="px-3 pb-3 space-y-3">
            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setShowTextInput(true)}
                disabled={isUploading || isRecording || showTextInput}
                className="flex flex-col items-center gap-1 p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText className="w-5 h-5 text-gray-600" />
                <span className="text-xs text-gray-600">Text</span>
              </button>

              <button
                onClick={handleVoiceRecording}
                disabled={isUploading || isRecording}
                className="flex flex-col items-center gap-1 p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mic className={`w-5 h-5 ${isRecording ? 'text-red-600 animate-pulse' : 'text-gray-600'}`} />
                <span className="text-xs text-gray-600">{isRecording ? 'Spelar in...' : 'Röst'}</span>
              </button>

              <button
                onClick={handleOpenCamera}
                disabled={isUploading || isRecording}
                className="flex flex-col items-center gap-1 p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Camera className="w-5 h-5 text-gray-600" />
                <span className="text-xs text-gray-600">Foto</span>
              </button>
            </div>

            {/* Inline Text Input */}
            {showTextInput && (
              <div className="bg-white rounded-lg border border-gray-300 p-3 space-y-2 shadow-sm">
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  onKeyDown={handleTextInputKeyDown}
                  placeholder="Skriv anteckning här…"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  autoFocus
                  disabled={isSavingText}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleTextNoteSave}
                    disabled={!textContent.trim() || isSavingText}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSavingText ? 'Sparar...' : 'Spara'}
                  </button>
                  <button
                    onClick={handleTextInputCancel}
                    disabled={isSavingText}
                    className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}

            {isUploading && (
              <div className="text-sm text-blue-600 text-center py-2">
                Laddar upp...
              </div>
            )}

            {/* Notes List */}
            {isLoading ? (
              <div className="text-sm text-gray-500 py-2">Laddar anteckningar...</div>
            ) : notes.length > 0 ? (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    onClick={() => onNoteClick(note)}
                    className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        {note.type === 'photo' ? '📷 Foto' : note.type === 'video' ? '🎥 Video' : '📝 Text'}
                      </span>
                    </div>
                    {note.kommentar && (
                      <p className="text-xs text-gray-600 mb-1">
                        {truncateText(note.kommentar, 80)}
                      </p>
                    )}
                    {(note.created_at || note.timestamp) && (
                      <p className="text-xs text-gray-500">
                        {new Date(note.created_at || note.timestamp).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-2">
                Inga anteckningar tillagda ännu
              </div>
            )}
          </div>
        )}
      </div>

      {/* Camera Preview Modal */}
      {showCameraPreview && !capturedPhoto && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8">
            <button
              onClick={handleCancelCamera}
              className="w-16 h-16 bg-gray-800 bg-opacity-75 rounded-full flex items-center justify-center text-white hover:bg-opacity-90 transition-opacity"
            >
              <X className="w-8 h-8" />
            </button>
            <button
              onClick={handleTakePhoto}
              className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 hover:border-gray-400 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Photo Preview and Comment Modal */}
      {showCameraPreview && capturedPhoto && photoPreviewUrl && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          <div className="flex-1 overflow-auto">
            <img
              src={photoPreviewUrl}
              alt="Preview"
              className="w-full h-auto"
            />
          </div>
          <div className="p-4 border-t border-gray-200 space-y-4">
            <textarea
              value={photoComment}
              onChange={(e) => setPhotoComment(e.target.value)}
              placeholder={isTranscribing ? "Transkriberar..." : "Lägg till kommentar..."}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              disabled={isTranscribing}
            />
            <div className="flex items-center gap-2">
              {isTranscribing ? (
                <button
                  disabled
                  className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg opacity-75 cursor-not-allowed"
                >
                  <Mic className="w-4 h-4 animate-pulse" />
                  <span className="text-sm">Transkriberar...</span>
                </button>
              ) : !isRecordingPhotoVoice ? (
                <button
                  onClick={handleTogglePhotoVoiceRecording}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mic className="w-4 h-4" />
                  <span className="text-sm">Spela in röst</span>
                </button>
              ) : (
                <button
                  onClick={handleTogglePhotoVoiceRecording}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 animate-pulse"
                >
                  <Mic className="w-4 h-4" />
                  <span className="text-sm">Stoppa ({photoVoiceRecordingTime}s)</span>
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSavePhoto}
                disabled={isUploading || isRecordingPhotoVoice || isTranscribing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-5 h-5" />
                <span>{isUploading ? 'Sparar...' : 'Spara'}</span>
              </button>
              <button
                onClick={handleCancelPhotoPreview}
                disabled={isUploading}
                className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
