import React, { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { getToken } from '../utils/auth';

interface EditProjectModalProps {
  project: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedData: any) => Promise<void>;
}

export const EditProjectModal: React.FC<EditProjectModalProps> = ({
  project,
  isOpen,
  onClose,
  onSave
}) => {
  const [name, setName] = useState(project.name || '');
  const [location, setLocation] = useState(project.location || '');
  const [date, setDate] = useState(
    project.date instanceof Date
      ? project.date.toISOString().split('T')[0]
      : project.project_date
        ? new Date(project.project_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
  );
  const [inspector, setInspector] = useState(project.inspector || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSuggestions]);

  const searchAddress = async (query: string) => {
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const token = getToken();
      if (!token) {
        console.error('No authentication token available');
        setAddressSuggestions([]);
        return;
      }

      const apiBaseUrl = import.meta.env.DEV
        ? 'http://localhost:3001/api'
        : import.meta.env.VITE_API_URL
          ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
          : '/api';

      const response = await fetch(
        `${apiBaseUrl}/address-search?q=${encodeURIComponent(query)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAddressSuggestions(data);
        setShowSuggestions(true);
      } else {
        console.error('Address search failed:', response.status);
        setAddressSuggestions([]);
      }
    } catch (error) {
      console.error('Address search failed:', error);
      setAddressSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchAddress(value);
    }, 500);
  };

  const handleSelectSuggestion = (suggestion: any) => {
    setLocation(suggestion.display_name);
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Projektnamn är obligatoriskt');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSave({
        name: name.trim(),
        location: location.trim(),
        project_date: date,
        inspector: inspector.trim()
      });
      onClose();
    } catch (err: any) {
      console.error('Failed to update project:', err);
      setError(err.message || 'Kunde inte uppdatera projektet');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setName(project.name || '');
    setLocation(project.location || '');
    setDate(
      project.date instanceof Date
        ? project.date.toISOString().split('T')[0]
        : project.project_date
          ? new Date(project.project_date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]
    );
    setInspector(project.inspector || '');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Ändra projektinformation</h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600"
            disabled={isSaving}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Projektnamn <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="T.ex. Villa Strandvägen 12"
              required
              disabled={isSaving}
            />
          </div>

          <div className="relative">
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
              Adress
            </label>
            <input
              type="text"
              id="location"
              value={location}
              onChange={(e) => handleLocationChange(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="T.ex. Strandvägen 12, Stockholm"
              disabled={isSaving}
              autoComplete="off"
            />
            {isLoadingSuggestions && (
              <div className="absolute right-3 top-11 text-sm text-gray-500">
                Söker...
              </div>
            )}
            {showSuggestions && addressSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
              >
                {addressSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                  >
                    <div className="text-sm font-medium text-gray-900">
                      {suggestion.display_name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Datum
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSaving}
            />
          </div>

          <div>
            <label htmlFor="inspector" className="block text-sm font-medium text-gray-700 mb-2">
              Inspektör
            </label>
            <input
              type="text"
              id="inspector"
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="T.ex. Anna Andersson"
              disabled={isSaving}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-5 h-5" />
              <span>{isSaving ? 'Sparar...' : 'Spara ändringar'}</span>
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Avbryt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
