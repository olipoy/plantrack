import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Mic, Square, Loader2, Image } from 'lucide-react';
import { Note } from '../types';
import { uploadFile, updateNoteDetails } from '../utils/api';

interface TextNoteModalProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onSave: (note: Note) => void;
}

export const TextNoteModal: React.FC<TextNoteModalProps> = ({
  projectId,
  projectName,
  onBack,
  onSave
}) => {
  const [textContent, setTextContent] = useState('');
  const [delomrade, setDelomrade] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioUpload(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setError('');

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Failed to start recording:', error);
      setError('Kunde inte starta inspelning. Kontrollera mikrofonbehörigheter.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setError('');

    try {
      const fileName = `voice_${Date.now()}.webm`;
      const file = new File([audioBlob], fileName, { type: 'audio/webm' });

      console.log('Uploading voice note:', {
        name: fileName,
        type: file.type,
        size: file.size,
        projectId
      });

      const response = await uploadFile(file, projectId, 'text');

      console.log('Voice upload response:', response);

      if (response.transcription) {
        setTextContent(prev => prev ? `${prev}\n\n${response.transcription}` : response.transcription);
      }

    } catch (error) {
      console.error('Voice upload failed:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte ladda upp röstanteckning');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSave = async () => {
    if (!textContent.trim()) {
      setError('Skriv en anteckning eller spela in röst först');
      return;
    }

    if (isSaving) return;

    setIsSaving(true);
    setError('');

    try {
      const fileName = `text_${Date.now()}.txt`;
      const textBlob = new Blob([textContent], { type: 'text/plain' });
      const file = new File([textBlob], fileName, { type: 'text/plain' });

      const response = await uploadFile(file, projectId, 'text');

      await updateNoteDetails(response.noteId, {
        kommentar: textContent,
        delomrade: delomrade
      });

      const note: Note = {
        id: response.noteId,
        type: 'text',
        kommentar: textContent,
        delomrade: delomrade,
        timestamp: new Date(),
        mediaUrl: response.mediaUrl,
        fileName: response.fileName,
        mimeType: response.mimeType,
        fileSize: response.fileSize
      };

      console.log('Saving text note:', note);

      onSave(note);
      onBack();

    } catch (error) {
      console.error('Save failed:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte spara anteckning');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePhotoUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Vänligen välj en bildfil');
      return;
    }

    setIsUploadingPhoto(true);
    setError('');

    try {
      console.log('Uploading photo from gallery:', {
        name: file.name,
        type: file.type,
        size: file.size,
        projectId
      });

      const response = await uploadFile(file, projectId, 'photo');

      console.log('Photo upload response:', response);

      await updateNoteDetails(response.noteId, {
        kommentar: textContent.trim() || undefined,
        delomrade: delomrade.trim() || undefined
      });

      const note: Note = {
        id: response.noteId,
        type: 'photo',
        kommentar: textContent.trim() || undefined,
        delomrade: delomrade.trim() || undefined,
        timestamp: new Date(),
        mediaUrl: response.mediaUrl,
        fileName: response.fileName,
        mimeType: response.mimeType,
        fileSize: response.fileSize
      };

      console.log('Saving photo note:', note);

      onSave(note);
      onBack();

    } catch (error) {
      console.error('Photo upload failed:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte ladda upp foto');
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
            disabled={isSaving || isTranscribing}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Anteckning</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Voice Recording Section */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Tala in anteckning</h3>

            {isRecording && (
              <div className="mb-3 text-center">
                <div className="inline-flex items-center px-4 py-2 bg-red-50 rounded-lg">
                  <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse mr-2"></div>
                  <span className="text-red-600 font-medium">{formatTime(recordingTime)}</span>
                </div>
              </div>
            )}

            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isTranscribing || isSaving}
              className={`w-full flex items-center justify-center p-4 rounded-xl transition-colors ${
                isRecording
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isRecording ? (
                <>
                  <Square className="w-5 h-5 mr-2" />
                  Stoppa inspelning
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 mr-2" />
                  Spela in röst
                </>
              )}
            </button>

            {isTranscribing && (
              <div className="mt-3 flex items-center justify-center text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-sm">Transkriberar...</span>
              </div>
            )}
          </div>

          {/* Delområde Input */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Delområde
            </label>
            <input
              type="text"
              value={delomrade}
              onChange={(e) => setDelomrade(e.target.value)}
              placeholder="T.ex. Kök, Ventilationspump..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSaving}
            />
          </div>

          {/* Text Input */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Skriv anteckning</h3>
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Skriv din anteckning här eller använd röstinspelning ovan..."
              rows={10}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isSaving}
            />
          </div>

          {/* Photo Upload Section */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Ladda upp foto</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="hidden"
            />
            <button
              onClick={handlePhotoUploadClick}
              disabled={isUploadingPhoto || isSaving || isTranscribing || isRecording}
              className="w-full flex items-center justify-center p-4 rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploadingPhoto ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Laddar upp...
                </>
              ) : (
                <>
                  <Image className="w-5 h-5 mr-2" />
                  Välj foto från galleri
                </>
              )}
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Fotot sparas med delområde och eventuell kommentar ovan
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving || isTranscribing || isRecording || isUploadingPhoto || !textContent.trim()}
            className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Sparar...
              </>
            ) : (
              'Spara anteckning'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
