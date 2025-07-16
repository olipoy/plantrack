import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Check, X, RotateCcw } from 'lucide-react';
import { Note } from '../types';
import { uploadFile } from '../utils/api';

interface CameraViewProps {
  projectId: string;
  onBack: () => void;
  onSave: (note: Omit<Note, 'id'>) => void;
}

export const CameraView: React.FC<CameraViewProps> = ({ projectId, onBack, onSave }) => {
  const [mode, setMode] = useState<'camera' | 'preview'>('camera');
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [capturedMedia, setCapturedMedia] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [transcription, setTranscription] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

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
      
      // Request camera and microphone permissions upfront
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Use back camera
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }, 
        audio: true 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Camera initialization failed:', error);
      setError('Kunde inte komma åt kameran. Kontrollera att du har gett tillåtelse till kamera och mikrofon.');
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
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
          setMediaType('photo');
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          setMode('preview');
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const startVideoRecording = () => {
    if (!streamRef.current) return;

    try {
      const recorder = new MediaRecorder(streamRef.current, {
        mimeType: 'video/webm;codecs=vp9'
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
        setCapturedMedia(blob);
        setMediaType('video');
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setMode('preview');
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

  // Handle button press (tap vs hold)
  const handleButtonPress = () => {
    if (isRecording) {
      stopVideoRecording();
      return;
    }

    isLongPressRef.current = false;
    
    // Start timer for long press detection
    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      startVideoRecording();
    }, 500); // 500ms for long press
  };

  const handleButtonRelease = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }

    // If it wasn't a long press and we're not recording, take a photo
    if (!isLongPressRef.current && !isRecording) {
      takePhoto();
    }
  };

  const handleConfirm = async () => {
    if (!capturedMedia) return;
    
    setIsUploading(true);
    setError('');
    
    try {
      const fileExtension = mediaType === 'photo' ? 'jpg' : 'webm';
      const fileName = `${mediaType}_${Date.now()}.${fileExtension}`;
      const file = new File([capturedMedia], fileName, { 
        type: mediaType === 'photo' ? 'image/jpeg' : 'video/webm'
      });

      console.log('Uploading file:', {
        name: fileName,
        type: file.type,
        size: file.size,
        projectId
      });

      const uploadResponse = await uploadFile(
        file,
        projectId,
        mediaType,
        (progress) => setUploadProgress(progress)
      );

      console.log('Upload response:', uploadResponse);

      if (uploadResponse.success) {
        setTranscription(uploadResponse.transcription || '');
        
        const note: Omit<Note, 'id'> = {
          type: mediaType,
          content: mediaType === 'photo' ? 'Foto taget' : 'Videoinspelning',
          transcription: uploadResponse.transcription,
          timestamp: new Date(),
          fileUrl: uploadResponse.fileUrl,
          fileName: uploadResponse.originalName,
          fileSize: uploadResponse.size
        };
        
        onSave(note);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error saving media:', error);
      setError(error instanceof Error ? error.message : 'Uppladdning misslyckades. Kontrollera internetanslutningen.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDiscard = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCapturedMedia(null);
    setPreviewUrl(null);
    setMode('camera');
    setError('');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isUploading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Laddar upp...</h3>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600">{Math.round(uploadProgress)}% slutfört</p>
            {mediaType === 'video' && (
              <p className="text-xs text-gray-500 mt-2">Transkriberar ljud...</p>
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
          
          {mode === 'camera' && (
            <div className="text-white text-center">
              <p className="text-sm opacity-80">
                {isRecording ? 'Spelar in video' : 'Tryck för foto, håll för video'}
              </p>
            </div>
          )}
          
          <div className="w-10" />
        </div>
      </div>

      {/* Camera View */}
      {mode === 'camera' && (
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
                onMouseDown={handleButtonPress}
                onMouseUp={handleButtonRelease}
                onTouchStart={handleButtonPress}
                onTouchEnd={handleButtonRelease}
                className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all duration-200 ${
                  isRecording 
                    ? 'bg-red-600 scale-110' 
                    : 'bg-white/20 hover:bg-white/30 active:scale-95'
                }`}
              >
                <div className={`rounded-full transition-all duration-200 ${
                  isRecording 
                    ? 'w-6 h-6 bg-white' 
                    : 'w-16 h-16 bg-white'
                }`} />
              </button>
            </div>
            
            <p className="text-white text-center text-sm mt-4 opacity-80">
              {isRecording ? 'Släpp för att stoppa' : 'Tryck för foto • Håll för video'}
            </p>
          </div>
        </>
      )}

      {/* Preview Mode */}
      {mode === 'preview' && previewUrl && (
        <>
          <div className="flex-1 flex items-center justify-center">
            {mediaType === 'photo' ? (
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
            {transcription && (
              <div className="bg-black/70 rounded-lg p-4 mb-6">
                <p className="text-white text-sm">{transcription}</p>
              </div>
            )}
            
            <div className="flex items-center justify-center space-x-8">
              <button
                onClick={handleDiscard}
                className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
              >
                <X className="w-8 h-8 text-white" />
              </button>
              
              <button
                onClick={handleConfirm}
                className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center hover:bg-green-700 transition-colors"
              >
                <Check className="w-8 h-8 text-white" />
              </button>
            </div>
            
            <p className="text-white text-center text-sm mt-4 opacity-80">
              Behåll eller ta om
            </p>
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