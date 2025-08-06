import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Check, X, Edit3 } from 'lucide-react';
import { Note } from '../types';
import { uploadFile, sendEmailWithPDF } from '../utils/api';
import { ensureSizeLimit, formatFileSize, getVideoDuration } from '../utils/videoCompression';
import { EmailModal } from './EmailModal';

interface CameraViewProps {
  projectId: string;
  mode: 'photo' | 'video';
  onBack: () => void;
  onSave: (note: Omit<Note, 'id'>) => void;
  projectName?: string;
}

export const CameraView: React.FC<CameraViewProps> = ({ projectId, mode, onBack, onSave, projectName = '' }) => {
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
  const [editableContent, setEditableContent] = useState('');
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState('');
  const [uploadResponse, setUploadResponse] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  
  // Email modal state
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [pendingEmailData, setPendingEmailData] = useState<any>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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
      setEditableContent(response.transcription || response.imageLabel || (mode === 'photo' ? 'Foto taget' : 'Videoinspelning'));
      setCurrentMode('edit');

    } catch (error) {
      console.error('Upload failed:', error);
      setError(error instanceof Error ? error.message : 'Uppladdning misslyckades');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveAndSend = async () => {
    if (!capturedMedia) return;
    
    setIsUploading(true);
    setError('');
    
    try {
      let response = uploadResponse;
      
      // Upload if not already uploaded
      if (!response) {
        const fileExtension = mode === 'photo' ? 'jpg' : 'webm';
        const fileName = `${mode}_${Date.now()}.${fileExtension}`;
        const file = new File([capturedMedia], fileName, { 
          type: mode === 'photo' ? 'image/jpeg' : 'video/webm'
        });

        response = await uploadFile(
          file,
          projectId,
          mode,
          (progress) => setUploadProgress(progress)
        );
      }
      
      // Create note object
      const note: Omit<Note, 'id'> = {
        type: mode,
        content: editableContent || response.transcription || response.imageLabel || (mode === 'photo' ? 'Foto taget' : 'Videoinspelning'),
        transcription: mode === 'video' ? (editableContent || response.transcription) : response.transcription,
        imageLabel: mode === 'photo' ? (editableContent || response.imageLabel) : response.imageLabel,
        timestamp: new Date(),
        fileUrl: response.fileUrl,
        fileName: response.originalName,
        fileSize: response.size
      };
      
      // Save the note first
      onSave(note);
      
      // Store email data for later use
      setPendingEmailData({
        projectName: projectName || 'Inspektionsrapport',
        content: editableContent || response.transcription || response.imageLabel || (mode === 'photo' ? 'Foto taget' : 'Videoinspelning'),
        fileUrl: response.fileUrl,
        fileName: response.originalName,
        fileType: response.mimeType,
        fileSize: response.size
      });
      
      // Navigate back to project view - this will trigger the modal
      onBack();
      
    } catch (error) {
      console.error('Upload failed:', error);
      setError(error instanceof Error ? error.message : 'Uppladdning misslyckades');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEmailModalClose = () => {
    setShowEmailModal(false);
    setEmailRecipient('');
    setEmailSubject('');
    setEmailMessage('');
    setIsSendingEmail(false);
    onBack(); // Go back to project view after modal closes
  };

  const handleDiscard = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCapturedMedia(null);
    setPreviewUrl(null);
    setEditableContent('');
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

  const handleSendEmail = async () => {
    if (!emailRecipient.trim() || !emailSubject.trim()) {
      alert('E-postadress och ämne är obligatoriska');
      return;
    }

    setIsSendingEmail(true);
    
    try {
      // Generate PDF from the current content
      const { generateProjectPDF } = await import('../utils/export');
      const mockProject = {
        name: emailSubject,
        location: 'Inspektionsplats',
        createdAt: new Date(),
        notes: [{
          type: mode,
          content: emailMessage,
          transcription: mode === 'video' ? emailMessage : undefined,
          imageLabel: mode === 'photo' ? emailMessage : undefined,
          timestamp: new Date()
        }]
      };
      
      const { pdfBuffer, fileName } = await generateProjectPDF(mockProject);
      
      await sendEmailWithPDF(
        emailRecipient.trim(),
        emailSubject.trim(),
        pdfBuffer,
        fileName,
        emailMessage.trim()
      );
      
      alert('E-post skickad!');
      handleEmailModalClose();
      
    } catch (error) {
      console.error('Failed to send email:', error);
      alert('Kunde inte skicka e-post: ' + (error instanceof Error ? error.message : 'Okänt fel'));
    } finally {
      setIsSendingEmail(false);
    }
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
          <div className="flex-1 flex flex-col">
            {/* Media Preview */}
            <div className="flex-1 flex items-center justify-center bg-black p-4">
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

            {/* Content Editor */}
            <div className="bg-white p-6 border-t border-gray-200">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {mode === 'photo' ? 'Bildtext' : 'Transkription'}
                  </h3>
                  <button
                    onClick={() => setIsEditingContent(!isEditingContent)}
                    className="flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    <Edit3 className="w-4 h-4 mr-1" />
                    {isEditingContent ? 'Spara' : 'Redigera'}
                  </button>
                </div>

                {isEditingContent ? (
                  <textarea
                    value={editableContent}
                    onChange={(e) => setEditableContent(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={4}
                    placeholder={mode === 'photo' ? 'Beskriv vad som syns på bilden...' : 'Redigera transkriptionen...'}
                  />
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3 min-h-[100px] border border-gray-200">
                    <p className="text-gray-800 whitespace-pre-wrap">
                      {editableContent || (mode === 'photo' ? 'Ingen bildtext genererad' : 'Ingen transkription tillgänglig')}
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
                  onClick={() => {
                    handleSaveAndSend();
                    setShowModal(true);
                  }}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Skicka rapport
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

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Skickar...
                    </>
                  ) : (
                    'Skicka'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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

  // Show modal when pendingEmailData is available
  useEffect(() => {
    if (pendingEmailData) {
      setEmailSubject(pendingEmailData.projectName);
      setEmailMessage(pendingEmailData.content);
      setShowModal(true);
      // Clear the pending data
      if (onEmailDataProcessed) {
        onEmailDataProcessed();
      }
    }
  }, [pendingEmailData, onEmailDataProcessed]);

  const handleCameraBack = () => {
    setCurrentView('detail');
  };

  const handleNoteSave = (note: Omit<Note, 'id'>) => {
    // Add the note to the project and update
    const updatedProject = {
      ...project,
      notes: [...(project.notes || []), { ...note, id: Date.now().toString() }],
      updatedAt: new Date()
    };
    onProjectUpdate(updatedProject);
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
    if (!emailRecipient.trim() || !emailSubject.trim()) {
      alert('E-postadress och ämne är obligatoriska');
      return;
    }

    setIsSendingEmail(true);
    
    try {
      // Generate PDF from the current content
      const { generateProjectPDF } = await import('../utils/export');
      const mockProject = {
        name: emailSubject,
        location: 'Inspektionsplats',
        createdAt: new Date(),
        notes: [{
          type: 'photo',
          content: emailMessage,
          timestamp: new Date()
        }]
      };
      
      const { pdfBuffer, fileName } = await generateProjectPDF(mockProject);
      
      await sendEmailWithPDF(
        emailRecipient.trim(),
        emailSubject.trim(),
        pdfBuffer,
        fileName,
        emailMessage.trim()
      );
      
      alert('E-post skickad!');
      setShowModal(false);
      setEmailRecipient('');
      setEmailSubject('');
      setEmailMessage('');
      
    } catch (error) {
      console.error('Failed to send email:', error);
      alert('Kunde inte skicka e-post: ' + (error instanceof Error ? error.message : 'Okänt fel'));
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
                  <div key={note.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">
                        {note.type === 'photo' ? '📷 Foto' : '🎥 Video'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {note.timestamp.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">{note.content}</p>
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

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Skickar...
                    </>
                  ) : (
                    'Skicka'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};