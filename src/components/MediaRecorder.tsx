import React, { useState, useRef } from 'react';
import { ArrowLeft, Camera, Video, Square, Save, Upload, CheckCircle, XCircle, Play } from 'lucide-react';
import { Note } from '../types';
import { uploadFile } from '../utils/api';

interface MediaRecorderProps {
  type: 'photo' | 'video';
  projectId: string;
  onBack: () => void;
  onSave: (note: Omit<Note, 'id'>) => void;
}

export const MediaRecorder: React.FC<MediaRecorderProps> = ({ type, projectId, onBack, onSave }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [recordedData, setRecordedData] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcription, setTranscription] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      setErrorMessage('');
      
      if (type === 'photo') {
        // Request back camera for photos
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment' // Use back camera
          } 
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } else if (type === 'video') {
        // Request back camera and audio for videos
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment' // Use back camera
          }, 
          audio: true 
        });
        streamRef.current = stream;
        
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          setRecordedData(blob);
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
        };
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        recorder.start();
        setIsRecording(true);
        startTimer();
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      setErrorMessage('Kunde inte starta inspelning. Kontrollera att du har gett tillåtelse till kamera och mikrofon.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTimer();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      if (context) {
        context.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            setRecordedData(blob);
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
          }
        }, 'image/jpeg', 0.8);
      }
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const startTimer = () => {
    intervalRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSave = async () => {
    if (!recordedData) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('idle');
    setErrorMessage('');
    
    try {
      // Create file from blob
      const fileExtension = type === 'photo' ? 'jpg' : 'webm';
      const fileName = `${type}_${Date.now()}.${fileExtension}`;
      const file = new File([recordedData], fileName, { 
        type: recordedData.type 
      });

      const uploadResponse = await uploadFile(
        file,
        projectId,
        type,
        (progress) => setUploadProgress(progress)
      );

      if (uploadResponse.success) {
        setUploadStatus('success');
        setTranscription(uploadResponse.transcription || '');
        
        const note: Omit<Note, 'id'> = {
          type,
          content: type === 'photo' ? 'Foto taget' : 'Videoinspelning',
          transcription: uploadResponse.transcription,
          timestamp: new Date(),
          fileUrl: uploadResponse.fileUrl,
          fileName: uploadResponse.originalName,
          fileSize: uploadResponse.size
        };
        
        // Wait a moment to show success state
        setTimeout(() => {
          onSave(note);
        }, 1500);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error saving note:', error);
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Uppladdning misslyckades');
    } finally {
      setIsUploading(false);
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'photo': return 'Ta foto';
      case 'video': return 'Videoinspelning';
      default: return 'Spela in';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'photo': return <Camera className="w-6 h-6" />;
      case 'video': return <Video className="w-6 h-6" />;
      default: return <Camera className="w-6 h-6" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-black">
      <div className="bg-black text-white px-4 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-white hover:bg-gray-800 rounded-lg transition-colors"
          disabled={isUploading}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">{getTitle()}</h1>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        {!recordedData && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        )}
        
        {recordedData && previewUrl && (
          <div className="w-full h-full flex items-center justify-center bg-black">
            {type === 'photo' ? (
              <img 
                src={previewUrl} 
                alt="Captured photo" 
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
        )}

        {isRecording && type === 'video' && (
          <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center">
            <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
            {formatTime(recordingTime)}
          </div>
        )}

        {/* Upload Progress Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
              <div className="text-center">
                <Upload className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Laddar upp...</h3>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600">{Math.round(uploadProgress)}% slutfört</p>
                {type === 'video' && (
                  <p className="text-xs text-gray-500 mt-2">Transkriberar ljud...</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success/Error Status */}
        {uploadStatus !== 'idle' && !isUploading && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
              <div className="text-center">
                {uploadStatus === 'success' ? (
                  <>
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Uppladdning klar!</h3>
                    <p className="text-sm text-gray-600">Sparar anteckning...</p>
                  </>
                ) : (
                  <>
                    <XCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Uppladdning misslyckades</h3>
                    <p className="text-sm text-gray-600">{errorMessage}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-black text-white p-6">
        {errorMessage && !isUploading && uploadStatus === 'idle' && (
          <div className="bg-red-600 text-white p-3 rounded-lg mb-4 text-sm">
            {errorMessage}
          </div>
        )}

        {!recordedData ? (
          <div className="flex items-center justify-center space-x-6">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                disabled={isUploading}
              >
                {getIcon()}
              </button>
            ) : (
              <button
                onClick={type === 'photo' ? takePhoto : stopRecording}
                className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
              >
                {type === 'photo' ? <Camera className="w-8 h-8" /> : <Square className="w-8 h-8" />}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {transcription && (
              <div className="bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-300 mb-2">Transkribering:</p>
                <p className="text-white">{transcription}</p>
              </div>
            )}
            
            {uploadStatus === 'idle' && !isUploading && (
              <div className="flex space-x-4">
                <button
                  onClick={onBack}
                  className="flex-1 bg-gray-700 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-600 transition-colors"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 bg-green-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center"
                >
                  <Save className="w-5 h-5 mr-2" />
                  Spara
                </button>
              </div>
            )}

            {uploadStatus === 'error' && (
              <button
                onClick={handleSave}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                Försök igen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};