import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Check, X, CreditCard as Edit3, Mic, Square, Loader2 } from 'lucide-react';
import { Note } from '../types';
import { uploadFile } from '../utils/api';
import { ensureSizeLimit, formatFileSize, getVideoDuration } from '../utils/videoCompression';

interface CameraViewProps {
  projectId: string;
  mode: 'photo' | 'video';
  onBack: () => void;
  onSave: (note: Omit<Note, 'id'> | Note, emailData?: any) => void;
}

export const CameraView: React.FC<CameraViewProps> = ({ projectId, mode, onBack, onSave }) => {
  const [currentMode, setCurrentMode] = useState<'camera' | 'preview' | 'edit'>('camera');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [capturedMedia, setCapturedMedia] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [transcription, setTranscription] = useState('');
  const [imageLabel, setImageLabel] = useState('');
  const [editableKommentar, setEditableKommentar] = useState('');
  const [delomrade, setDelomrade] = useState('');
  const [isEditingKommentar, setIsEditingKommentar] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState('');
  const [uploadResponse, setUploadResponse] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceRecordingTime, setVoiceRecordingTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);

  // Initialize camera on mount
  useEffect(() => {
    initializeCamera();
    return () => {
      cleanup();
    };
  }, []);

  const initializeCamera = async () => {
    try {
      setError('');
      
      // Optimized constraints for smaller file sizes
      const constraints = {
        video: { 
          facingMode: 'environment',
          width: { ideal: 640, max: 854 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 15, max: 24 }
        },
        audio: mode === 'video' // Only request audio for video mode
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Camera initialization failed:', error);
      setError('Kunde inte komma åt kameran. Kontrollera att du har gett tillåtelse till kamera' + (mode === 'video' ? ' och mikrofon' : '') + '.');
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (voiceIntervalRef.current) {
      clearInterval(voiceIntervalRef.current);
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  };

  const startRecordingTimer = () => {
    setRecordingTime(0);
    intervalRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopRecordingTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !streamRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    if (context) {
      context.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          setCapturedMedia(blob);
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          setCurrentMode('preview');
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const startVideoRecording = () => {
    if (!streamRef.current || isRecording) return;

    try {
      // Use more efficient codec settings for smaller files
      let mimeType = 'video/webm;codecs=vp8,opus'; // VP8 is more efficient than VP9
      
      // Fallback options if VP8 is not supported
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      
      const recorder = new MediaRecorder(streamRef.current, {
        mimeType,
        videoBitsPerSecond: 500000, // 500 kbps - much lower than default
        audioBitsPerSecond: 64000   // 64 kbps audio
      });
      
      mediaRecorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        
        // Compress video before preview
        compressAndSetMedia(blob);
      };
      
      recorder.start();
      setIsRecording(true);
      startRecordingTimer();
    } catch (error) {
      console.error('Video recording failed:', error);
      setError('Videoinspelning misslyckades. Försök igen.');
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopRecordingTimer();
    }
  };

  const compressAndSetMedia = async (originalBlob: Blob) => {
    setIsCompressing(true);
    setCompressionProgress('Komprimerar video...');
    
    try {
      // Get original video info
      const originalSize = originalBlob.size;
      const duration = await getVideoDuration(originalBlob);
      
      console.log(`Original video: ${formatFileSize(originalSize)}, ${duration.toFixed(1)}s`);
      setCompressionProgress(`Original: ${formatFileSize(originalSize)} (${duration.toFixed(1)}s)`);
      
      // Compress to ensure it's under 20MB (buffer for 25MB limit)
      const compressedBlob = await ensureSizeLimit(originalBlob, 20);
      
      const compressionRatio = ((originalSize - compressedBlob.size) / originalSize * 100);
      console.log(`Compressed: ${formatFileSize(compressedBlob.size)} (${compressionRatio.toFixed(1)}% reduction)`);
      
      setCapturedMedia(compressedBlob);
      const url = URL.createObjectURL(compressedBlob);
      setPreviewUrl(url);
      setCurrentMode('preview');
      
    } catch (error) {
      console.error('Compression failed:', error);
      // Fall back to original if compression fails
      setCapturedMedia(originalBlob);
      const url = URL.createObjectURL(originalBlob);
      setPreviewUrl(url);
      setCurrentMode('preview');
      setError('Video compression failed, using original file');
    } finally {
      setIsCompressing(false);
      setCompressionProgress('');
    }
  };

  const handleCameraAction = () => {
    if (mode === 'photo') {
      takePhoto();
    } else {
      if (isRecording) {
        stopVideoRecording();
      } else {
        startVideoRecording();
      }
    }
  };

  const handleConfirm = async () => {
    if (!capturedMedia) return;
    
    setIsUploading(true);
    setError('');
    
    try {
      const fileExtension = mode === 'photo' ? 'jpg' : 'webm';
      const fileName = `${mode}_${Date.now()}.${fileExtension}`;
      const file = new File([capturedMedia], fileName, { 
        type: mode === 'photo' ? 'image/jpeg' : 'video/webm'
      });

      console.log('Uploading file:', {
        name: fileName,
        type: file.type,
        size: file.size,
        projectId
      });

      const response = await uploadFile(
        file,
        projectId,
        mode,
        (progress) => setUploadProgress(progress)
      );

      console.log('Upload response:', response);

      // Store the upload response and set up edit mode
      setUploadResponse(response);
      setTranscription(response.transcription || '');
      setImageLabel(response.imageLabel || '');
      // Pre-fill kommentar with AI-generated content: image_label for photos, transcription for videos
      setEditableKommentar(mode === 'photo' ? (response.imageLabel || '') : (response.transcription || ''));
      setCurrentMode('edit');

    } catch (error) {
      console.error('Upload failed:', error);
      setError(error instanceof Error ? error.message : 'Uppladdning misslyckades');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveAndSend = async () => {
    if (!uploadResponse) return;
    if (isSaving) return; // Prevent multiple calls

    setIsSaving(true);

    try {
      // Update the note in database with edited kommentar and delomrade
      const { updateNoteDetails } = await import('../utils/api');
      await updateNoteDetails(uploadResponse.noteId, {
        imageLabel: imageLabel, // Keep original AI-generated label
        kommentar: editableKommentar,
        delomrade: delomrade,
        transcription: transcription // Keep original transcription
      });

      // Create note object with edited kommentar
      const note: Note = {
        id: uploadResponse.noteId, // Use the ID from upload response
        type: mode,
        kommentar: editableKommentar,
        transcription: transcription,
        imageLabel: imageLabel,
        delomrade: delomrade,
        timestamp: new Date(),
        mediaUrl: uploadResponse.mediaUrl,
        fileName: uploadResponse.fileName,
        mimeType: uploadResponse.mimeType,
        fileSize: uploadResponse.fileSize
      };

      console.log('Saving note with edited kommentar and delomrade:', note);
      console.log('Note ID from upload response:', uploadResponse.noteId);

      // Just save the note, don't auto-send email
      onSave(note);
    } catch (error) {
      console.error('Failed to update note:', error);
      setError(error instanceof Error ? error.message : 'Failed to save note');
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCapturedMedia(null);
    setPreviewUrl(null);
    setEditableKommentar('');
    setDelomrade('');
    setTranscription('');
    setImageLabel('');
    setUploadResponse(null);
    setCurrentMode('camera');
    setError('');
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });

      voiceRecorderRef.current = recorder;
      voiceChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(voiceChunksRef.current, { type: 'audio/webm' });
        await handleVoiceUpload(audioBlob);
      };

      recorder.start();
      setIsRecordingVoice(true);
      setVoiceRecordingTime(0);
      setError('');

      voiceIntervalRef.current = setInterval(() => {
        setVoiceRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Failed to start voice recording:', error);
      setError('Kunde inte starta röstinspelning. Kontrollera mikrofonbehörigheter.');
    }
  };

  const stopVoiceRecording = () => {
    if (voiceRecorderRef.current && isRecordingVoice) {
      voiceRecorderRef.current.stop();
      setIsRecordingVoice(false);

      if (voiceIntervalRef.current) {
        clearInterval(voiceIntervalRef.current);
      }

      if (voiceStreamRef.current) {
        voiceStreamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const handleVoiceUpload = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setError('');

    try {
      const fileName = `voice_${Date.now()}.webm`;
      const file = new File([audioBlob], fileName, { type: 'audio/webm' });

      console.log('Uploading voice note for transcription:', {
        name: fileName,
        type: file.type,
        size: file.size,
        projectId
      });

      const response = await uploadFile(file, projectId, 'text');

      console.log('Voice transcription response:', response);

      if (response.transcription) {
        setEditableKommentar(prev => prev ? `${prev}\n\n${response.transcription}` : response.transcription);
      }

    } catch (error) {
      console.error('Voice transcription failed:', error);
      setError(error instanceof Error ? error.message : 'Kunde inte transkribera röstanteckning');
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatVoiceTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isUploading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Laddar upp...
            </h3>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600">{Math.round(uploadProgress)}% slutfört</p>
            {mode === 'video' && (
              <p className="text-xs text-gray-500 mt-2">Transkriberar ljud...</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isCompressing) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Komprimerar video</h3>
            <p className="text-sm text-gray-600 mb-2">Optimerar filstorlek...</p>
            {compressionProgress && (
              <p className="text-xs text-gray-500">{compressionProgress}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center justify-between p-4 pt-12">
          <button
            onClick={onBack}
            className="p-2 text-white hover:bg-white/20 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          
          {currentMode === 'camera' && (
            <div className="text-white text-center">
              <p className="text-sm opacity-80">
                {mode === 'photo' ? 'Foto' : 'Video'}
              </p>
            </div>
          )}
          
          <div className="w-10" />
        </div>
      </div>

      {/* Camera View */}
      {currentMode === 'camera' && (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          
          {/* Recording indicator */}
          {isRecording && (
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full flex items-center">
              <div className="w-3 h-3 bg-white rounded-full mr-2 animate-pulse" />
              {formatTime(recordingTime)}
            </div>
          )}

          {/* Camera Controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-8">
            <div className="flex items-center justify-center">
              <button
                onClick={handleCameraAction}
                className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all duration-200 ${
                  isRecording 
                    ? 'bg-red-600 scale-110' 
                    : 'bg-white/20 hover:bg-white/30 active:scale-95'
                }`}
              >
                <div className={`rounded-full transition-all duration-200 ${
                  isRecording 
                    ? 'w-6 h-6 bg-white' 
                    : mode === 'photo'
                    ? 'w-16 h-16 bg-white'
                    : 'w-6 h-6 bg-red-600'
                }`} />
              </button>
            </div>
            
            <p className="text-white text-center text-sm mt-4 opacity-80">
              {mode === 'photo' ? 'Tryck för att ta foto' :
               isRecording ? 'Tryck för att stoppa' : 'Tryck för att börja spela in'}
            </p>
          </div>
        </>
      )}

      {/* Preview Mode */}
      {currentMode === 'preview' && previewUrl && (
        <>
          <div className="flex-1 flex items-center justify-center">
            {mode === 'photo' ? (
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <video 
                src={previewUrl} 
                controls 
                className="max-w-full max-h-full object-contain"
              />
            )}
          </div>

          {/* Preview Controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-8">
            {/* Show file size info */}
            {capturedMedia && (
              <div className="bg-black/70 rounded-lg p-3 mb-4">
                <p className="text-white text-xs text-center">
                  Filstorlek: {formatFileSize(capturedMedia.size)}
                  {capturedMedia.size > 20 * 1024 * 1024 && (
                    <span className="text-yellow-300 ml-2">⚠️ Stor fil</span>
                  )}
                </p>
              </div>
            )}
            
            <div className="flex items-center justify-center space-x-8">
              <button
                onClick={handleDiscard}
                className="w-16 h-16 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-8 h-8 text-white" />
              </button>
              
              <button
                onClick={handleConfirm}
                disabled={capturedMedia && capturedMedia.size > 25 * 1024 * 1024}
                className="w-16 h-16 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
              >
                <Check className="w-8 h-8 text-white" />
              </button>
            </div>
            
            <p className="text-white text-center text-sm mt-4 opacity-80">
              {capturedMedia && capturedMedia.size > 25 * 1024 * 1024
                ? 'Filen är för stor - ta om med kortare inspelning'
                : 'Ta om • Spara'
              }
            </p>
          </div>
        </>
      )}

      {/* Edit Mode - Preview with editable content */}
      {currentMode === 'edit' && previewUrl && (
        <>
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Media Preview */}
            <div className="flex-shrink-0 h-1/2 flex items-center justify-center bg-black p-4">
              {mode === 'photo' ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              ) : (
                <video
                  src={previewUrl}
                  controls
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              )}
            </div>

            {/* Content Editor - Scrollable */}
            <div className="flex-1 bg-white p-6 border-t border-gray-200 overflow-y-auto">
              {/* Delområde Field */}
              <div className="mb-4">
                <label htmlFor="delomrade" className="block text-sm font-medium text-gray-700 mb-2">
                  Delområde
                </label>
                <input
                  type="text"
                  id="delomrade"
                  value={delomrade}
                  onChange={(e) => setDelomrade(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="T.ex. Kök, Ventilationspump..."
                />
              </div>

              {/* Voice Recording Section */}
              <div className="mb-4 bg-white rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Röstanteckning</h3>

                {isRecordingVoice && (
                  <div className="mb-3 text-center">
                    <div className="inline-flex items-center px-4 py-2 bg-red-50 rounded-lg">
                      <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse mr-2"></div>
                      <span className="text-red-600 font-medium">{formatVoiceTime(voiceRecordingTime)}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
                  disabled={isTranscribing || isSaving}
                  className={`w-full flex items-center justify-center p-3 rounded-lg transition-colors ${
                    isRecordingVoice
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isRecordingVoice ? (
                    <>
                      <Square className="w-4 h-4 mr-2" />
                      Stoppa inspelning
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 mr-2" />
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

              {/* Kommentar Field */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Kommentar
                  </h3>
                  <button
                    onClick={() => setIsEditingKommentar(!isEditingKommentar)}
                    className="flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    <Edit3 className="w-4 h-4 mr-1" />
                    {isEditingKommentar ? 'Spara' : 'Redigera'}
                  </button>
                </div>

                {isEditingKommentar ? (
                  <textarea
                    value={editableKommentar}
                    onChange={(e) => setEditableKommentar(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={4}
                    placeholder="Lägg till kommentar..."
                  />
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3 min-h-[100px] border border-gray-200">
                    <p className="text-gray-800 whitespace-pre-wrap">
                      {editableKommentar || 'Ingen kommentar'}
                    </p>
                  </div>
                )}
              </div>


              {/* File info */}
              {capturedMedia && (
                <div className="bg-blue-50 rounded-lg p-3 mb-4">
                  <p className="text-blue-800 text-sm">
                    📁 Filstorlek: {formatFileSize(capturedMedia.size)}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleDiscard}
                  className="flex-1 px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Ta om
                </button>
                <button
                  onClick={handleSaveAndSend}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Ladda upp
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute bottom-20 left-4 right-4 bg-red-600 text-white p-4 rounded-lg">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};