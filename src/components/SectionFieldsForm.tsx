import React, { useState, useEffect, useRef } from 'react';
import { Mic, Save, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { getSectionFields, saveSectionField, SectionField } from '../utils/api';

interface FieldDefinition {
  name: string;
  label: string;
  type: 'text' | 'date' | 'textarea';
  placeholder?: string;
}

interface SectionFieldsFormProps {
  sectionId: string;
  sectionName: string;
  projectId: string;
}

const SECTION_FIELDS: Record<string, FieldDefinition[]> = {
  'Fastighetsuppgifter': [
    { name: 'fastighetsbeteckning', label: 'Fastighetsbeteckning', type: 'text', placeholder: 'T.ex. Stockholm 1:1' },
    { name: 'adress', label: 'Adress', type: 'text', placeholder: 'Gatuadress' },
    { name: 'fastighetsagare', label: 'Fastighetsägare', type: 'text', placeholder: 'Namn på fastighetsägare' },
    { name: 'besiktningsdatum', label: 'Besiktningsdatum', type: 'date' },
    { name: 'besiktningsman', label: 'Besiktningsman', type: 'text', placeholder: 'Namn på besiktningsman' },
    { name: 'narvarande', label: 'Närvarande', type: 'text', placeholder: 'Personer närvarande vid besiktning' },
  ],
  'Byggnadsbeskrivning': [
    { name: 'byggnadsaar', label: 'Byggnadsår', type: 'text', placeholder: 'År' },
    { name: 'ombyggnad_tillbyggnad', label: 'Ombyggnad/Tillbyggnad', type: 'text', placeholder: 'Beskrivning' },
    { name: 'hustyp', label: 'Hustyp', type: 'text', placeholder: 'T.ex. Villa, Radhus' },
    { name: 'antal_vaningar', label: 'Antal våningar', type: 'text', placeholder: 'Antal' },
    { name: 'taktyp', label: 'Taktyp', type: 'text', placeholder: 'T.ex. Sadeltak' },
    { name: 'takbelaggning', label: 'Takbeläggning', type: 'text', placeholder: 'Material' },
    { name: 'stomme', label: 'Stomme', type: 'text', placeholder: 'Stommaterial' },
    { name: 'material', label: 'Material', type: 'text', placeholder: 'Byggnadsmaterial' },
    { name: 'fasad', label: 'Fasad', type: 'text', placeholder: 'Fasadmaterial' },
    { name: 'fonster', label: 'Fönster', type: 'text', placeholder: 'Fönstertyp' },
    { name: 'ventilation', label: 'Ventilation', type: 'text', placeholder: 'Ventilationssystem' },
    { name: 'varmesystem', label: 'Värmesystem', type: 'text', placeholder: 'Typ av uppvärmning' },
    { name: 'grundkonstruktion', label: 'Grundkonstruktion', type: 'text', placeholder: 'Grundtyp' },
    { name: 'terrangforhallanden', label: 'Terrängförhållanden', type: 'text', placeholder: 'Beskrivning' },
    { name: 'garage', label: 'Garage', type: 'text', placeholder: 'Garageinformation' },
  ],
  'Besiktningsuppgifter': [
    { name: 'typ_av_besiktning', label: 'Typ av besiktning', type: 'text', placeholder: 'T.ex. Statusbesiktning' },
    { name: 'bestallare', label: 'Beställare', type: 'text', placeholder: 'Beställarens namn' },
    { name: 'uppdragsnummer', label: 'Uppdragsnummer', type: 'text', placeholder: 'Referensnummer' },
    { name: 'handlingar', label: 'Handlingar', type: 'text', placeholder: 'Vilka handlingar som granskats' },
    { name: 'ovrigt', label: 'Övrigt', type: 'text', placeholder: 'Övrig information' },
  ],
  'Besiktningsutlåtande': [
    { name: 'besiktningsutlatande', label: 'Besiktningsutlåtande', type: 'textarea', placeholder: 'Skriv en sammanfattande bedömning...' },
  ],
};

export const SectionFieldsForm: React.FC<SectionFieldsFormProps> = ({
  sectionId,
  sectionName,
  projectId,
}) => {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fieldDefinitions = SECTION_FIELDS[sectionName] || [];

  useEffect(() => {
    if (fieldDefinitions.length > 0) {
      loadFields();
    }
  }, [sectionId]);

  const loadFields = async () => {
    try {
      setLoading(true);
      const savedFields = await getSectionFields(sectionId);
      const fieldMap: Record<string, string> = {};
      savedFields.forEach((field: SectionField) => {
        fieldMap[field.name] = field.value;
      });
      setFields(fieldMap);
    } catch (error) {
      console.error('Failed to load fields:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setFields(prev => ({ ...prev, [fieldName]: value }));
  };

  const saveField = async (fieldName: string, value: string, type: 'text' | 'voice' = 'text') => {
    try {
      setSaving(fieldName);
      await saveSectionField(sectionId, fieldName, value, type);
    } catch (error) {
      console.error('Failed to save field:', error);
      alert('Kunde inte spara fältet');
    } finally {
      setSaving(null);
    }
  };

  const handleBlur = (fieldName: string) => {
    const value = fields[fieldName] || '';
    if (value) {
      saveField(fieldName, value, 'text');
    }
  };

  const startRecording = async (fieldName: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAudio(fieldName, audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecording(fieldName);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Kunde inte starta inspelningen');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(null);
    }
  };

  const uploadAudio = async (fieldName: string, audioBlob: Blob) => {
    try {
      setSaving(fieldName);
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('projectId', projectId);
      formData.append('noteType', 'voice');

      const token = localStorage.getItem('token');
      const API_BASE_URL = import.meta.env.DEV
        ? 'http://localhost:3001/api'
        : import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/api`
        : '/api';

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      const transcription = result.transcription || '';

      if (transcription) {
        handleFieldChange(fieldName, transcription);
        await saveSectionField(sectionId, fieldName, transcription, 'voice');
      }
    } catch (error) {
      console.error('Failed to upload audio:', error);
      alert('Kunde inte ladda upp inspelningen');
    } finally {
      setSaving(null);
    }
  };

  if (fieldDefinitions.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-600" />
          )}
          <h3 className="font-semibold text-gray-900">{sectionName}</h3>
        </div>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          {Object.keys(fields).length}/{fieldDefinitions.length} ifylld
        </span>
      </button>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-3 border-t border-gray-100">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            fieldDefinitions.map((field) => (
              <div key={field.name} className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  {field.label}
                </label>
                <div className="flex items-center gap-2">
                  {field.type === 'textarea' ? (
                    <textarea
                      value={fields[field.name] || ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      onBlur={() => handleBlur(field.name)}
                      placeholder={field.placeholder}
                      rows={6}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                    />
                  ) : field.type === 'date' ? (
                    <input
                      type="date"
                      value={fields[field.name] || ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      onBlur={() => handleBlur(field.name)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={fields[field.name] || ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      onBlur={() => handleBlur(field.name)}
                      placeholder={field.placeholder}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  )}
                  <button
                    onClick={() =>
                      recording === field.name ? stopRecording() : startRecording(field.name)
                    }
                    disabled={saving === field.name || (recording !== null && recording !== field.name)}
                    className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all flex-shrink-0 ${
                      recording === field.name
                        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={recording === field.name ? 'Stoppa inspelning' : 'Spela in röstinmatning'}
                  >
                    {saving === field.name ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
