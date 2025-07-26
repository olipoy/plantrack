import React, { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Note } from '../types';
import { uploadFile } from '../utils/api';

interface MediaRecorderProps {
  projectId: string;
  onBack: () => void;
  onSave: (note: Omit<Note, 'id'>) => void;
}

export const MediaRecorder: React.FC<MediaRecorderProps> = ({ projectId, onBack, onSave }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    
    try {
      // Create a text note directly without file upload
      const note: Omit<Note, 'id'> = {
        type: 'text',
        content: content.trim(),
        timestamp: new Date()
      };

      onSave(note);
      onBack();
    } catch (error) {
      console.error('Failed to save text note:', error);
      alert('Kunde inte spara anteckning. Försök igen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="mr-3 p-2 -ml-2 text-gray-600 hover:text-gray-900 active:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Ny textanteckning</h1>
        </div>
      </div>

      <div className="flex-1 p-4">
        <form onSubmit={handleSubmit} className="h-full flex flex-col">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Skriv din anteckning här..."
            className="flex-1 w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-lg"
            required
          />
          
          <button
            type="submit"
            disabled={!content.trim() || isSubmitting}
            className="mt-4 w-full bg-green-600 text-white py-4 px-6 rounded-xl font-medium text-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center"
          >
            {isSubmitting ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Plus className="w-5 h-5 mr-2" />
                Spara anteckning
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};