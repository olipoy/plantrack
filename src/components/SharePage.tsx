import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardList, Calendar, MapPin, AlertCircle, Play } from 'lucide-react';

interface ShareData {
  type: string;
  mediaUrl: string;
  caption: string;
  projectName: string;
  createdAt: string;
  mimeType: string;
}

export const SharePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Ogiltig delningslänk');
      setIsLoading(false);
      return;
    }

    const loadShareData = async () => {
      try {
        const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';
        const response = await fetch(`${API_BASE_URL}/share/${token}`);
        
        if (response.status === 404) {
          setError('Delad länk hittades inte');
          return;
        }
        
        if (response.status === 410) {
          setError('Delad länk har gått ut');
          return;
        }
        
        if (response.status === 429) {
          setError('För många förfrågningar. Försök igen senare.');
          return;
        }
        
        if (!response.ok) {
          throw new Error('Kunde inte ladda delat innehåll');
        }
        
        const data = await response.json();
        setShareData(data);
      } catch (error) {
        console.error('Failed to load share:', error);
        setError('Kunde inte ladda delat innehåll');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadShareData();
  }, [token]);

  const formatNoteType = (type: string) => {
    switch (type) {
      case 'photo': return 'Foto';
      case 'video': return 'Video';
      case 'text': return 'Textanteckning';
      default: return type;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Laddar delat innehåll...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Kunde inte ladda innehåll</h1>
            <p className="text-gray-500 mt-2">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!shareData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Inget innehåll hittades</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mr-3">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Inspektionsassistent</h1>
              <p className="text-sm text-gray-500">Delat innehåll</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Project Info */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{shareData.projectName}</h2>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {formatNoteType(shareData.type)}
              </span>
            </div>
            <div className="flex items-center text-gray-500 text-sm">
              <Calendar className="w-4 h-4 mr-2" />
              <span>{formatDate(shareData.createdAt)}</span>
            </div>
          </div>

          {/* Media Content */}
          <div className="p-6">
            {shareData.mediaUrl && (
              <div className="mb-6">
                {shareData.type === 'photo' ? (
                  <img
                    src={shareData.mediaUrl}
                    alt={shareData.caption || 'Delat foto'}
                    className="w-full max-h-96 object-contain rounded-lg border border-gray-200"
                  />
                ) : shareData.type === 'video' ? (
                  <video
                    src={shareData.mediaUrl}
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
            )}

            {/* Caption/Transcription */}
            {shareData.caption && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {shareData.type === 'photo' ? 'Bildtext' : shareData.type === 'video' ? 'Transkription' : 'Innehåll'}
                </h3>
                <p className="text-gray-800 whitespace-pre-wrap">{shareData.caption}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Detta innehåll har delats från Inspektionsassistenten
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};