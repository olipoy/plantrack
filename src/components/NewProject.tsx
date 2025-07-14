import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Plus, MapPin, Calendar, User, Building } from 'lucide-react';
import { createProject, shortenAddress } from '../utils/storage';
import { Project } from '../types';

interface NewProjectProps {
  onBack: () => void;
  onProjectCreated: (project: Project) => void;
}

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export const NewProject: React.FC<NewProjectProps> = ({ onBack, onProjectCreated }) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [inspector, setInspector] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Address autocomplete state
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const addressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchAddresses = async (query: string) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      // Using Nominatim (OpenStreetMap) API for address search - free and no API key required
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=se&q=${encodeURIComponent(query)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setAddressSuggestions(data);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Address search failed:', error);
      setAddressSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    
    // Clear existing timeout
    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }

    // Set new timeout for search
    addressTimeoutRef.current = setTimeout(() => {
      searchAddresses(value);
    }, 300);
  };

  const selectAddress = (suggestion: AddressSuggestion) => {
    // Shorten the address before setting it
    const shortAddress = shortenAddress(suggestion.display_name);
    setAddress(shortAddress);
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim() || !date || !inspector.trim()) return;

    setIsSubmitting(true);
    
    try {
      const project = createProject(name.trim(), address.trim(), new Date(date), inspector.trim());
      onProjectCreated(project);
    } catch (error) {
      console.error('Error creating project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateForDisplay = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('sv-SE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isFormValid = name.trim() && address.trim() && date && inspector.trim();

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
          <h1 className="text-lg font-semibold text-gray-900">Nytt projekt</h1>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center">
                <Building className="w-4 h-4 mr-2 text-gray-500" />
                Projektnamn
              </div>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              placeholder="T.ex. Kontorsbyggnad A - Ventilation"
              required
            />
          </div>

          {/* Address with Autocomplete */}
          <div className="relative">
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                Adress
              </div>
            </label>
            <input
              type="text"
              id="address"
              value={address}
              onChange={(e) => handleAddressChange(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              placeholder="Börja skriv adress..."
              required
              autoComplete="off"
            />
            
            {/* Address Suggestions Dropdown */}
            {showSuggestions && (addressSuggestions.length > 0 || isLoadingSuggestions) && (
              <div 
                ref={suggestionsRef}
                className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-y-auto"
              >
                {isLoadingSuggestions ? (
                  <div className="p-4 text-center text-gray-500">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Söker adresser...
                  </div>
                ) : (
                  addressSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => selectAddress(suggestion)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-start">
                        <MapPin className="w-4 h-4 mr-2 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-gray-900 text-sm block">{shortenAddress(suggestion.display_name)}</span>
                          <span className="text-gray-500 text-xs">{suggestion.display_name}</span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Date Picker */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                Datum
              </div>
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              {formatDateForDisplay(date)}
            </p>
          </div>

          {/* Inspector Name */}
          <div>
            <label htmlFor="inspector" className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center">
                <User className="w-4 h-4 mr-2 text-gray-500" />
                Inspektör
              </div>
            </label>
            <input
              type="text"
              id="inspector"
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              placeholder="Ditt namn"
              required
            />
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-medium text-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center"
          >
            {isSubmitting ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Plus className="w-5 h-5 mr-2" />
                Skapa projekt
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};