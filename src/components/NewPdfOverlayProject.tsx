import React, { useState } from 'react';
import { ArrowLeft, Upload, FileText, Image as ImageIcon } from 'lucide-react';
import { Project } from '../types';
import { getToken } from '../utils/auth';

interface NewPdfOverlayProjectProps {
  onBack: () => void;
  onProjectCreated: (project: Project) => void;
}

export const NewPdfOverlayProject: React.FC<NewPdfOverlayProjectProps> = ({
  onBack,
  onProjectCreated
}) => {
  const [name, setName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setError('Endast PDF, JPG och PNG filer är tillåtna');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Filen är för stor. Max storlek är 10MB');
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !selectedFile) {
      setError('Fyll i projektnamn och välj en fil');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = getToken();
      if (!token) {
        throw new Error('Ej inloggad');
      }

      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('type', 'pdfOverlay');
      formData.append('file', selectedFile);

      // Get API base URL
      const apiBaseUrl = import.meta.env.DEV
        ? 'http://localhost:3001/api'
        : import.meta.env.VITE_API_URL
          ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
          : '/api';

      const response = await fetch(`${apiBaseUrl}/projects/pdf-overlay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Kunde inte skapa projekt');
      }

      const projectData = await response.json();

      // Convert to frontend format
      const project: Project = {
        id: projectData.id,
        name: projectData.name,
        location: projectData.location || '',
        date: new Date(projectData.project_date || projectData.created_at),
        inspector: projectData.inspector || '',
        createdAt: new Date(projectData.created_at),
        updatedAt: new Date(projectData.updated_at || projectData.created_at),
        notes: [],
        template: 'pdfOverlay'
      };

      onProjectCreated(project);
    } catch (err) {
      console.error('Error creating PDF overlay project:', err);
      setError(err instanceof Error ? err.message : 'Kunde inte skapa projekt');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFileIcon = () => {
    if (!selectedFile) return <Upload className="w-12 h-12 text-gray-400" />;

    if (selectedFile.type === 'application/pdf') {
      return <FileText className="w-12 h-12 text-red-500" />;
    }
    return <ImageIcon className="w-12 h-12 text-blue-500" />;
  };

  return (
    <div className="flex flex-col h-full pb-16">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="mr-3 p-2 -ml-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Egen PDF-mall</h1>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Projektnamn *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              placeholder="T.ex. OVK Kontorsbyggnad"
              required
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Välj PDF eller bild *
            </label>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />

              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="flex flex-col items-center">
                  {getFileIcon()}

                  {selectedFile ? (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-900">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <p className="text-xs text-blue-600 mt-2">
                        Klicka för att välja en annan fil
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-900">
                        Klicka för att välja fil
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        PDF, JPG eller PNG (max 10MB)
                      </p>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!name.trim() || !selectedFile || isSubmitting}
            className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-medium text-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center"
          >
            {isSubmitting ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Skapa projekt
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
