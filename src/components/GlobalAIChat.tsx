import React, { useState, useRef, useEffect } from 'react';
import { Project, ChatMessage } from '../types';
import { Send, Bot, Search, FolderOpen, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { sendChatMessage, checkServerHealth, getUserProjects, getProjectById } from '../utils/api';
import { generateId, saveChatHistory, loadChatHistory } from '../utils/storage';

interface GlobalAIChatProps {
  projects: Project[];
}

export const GlobalAIChat: React.FC<GlobalAIChatProps> = ({ projects }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory());
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [error, setError] = useState('');
  const [projectsWithNotes, setProjectsWithNotes] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Save chat history whenever messages change
  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    checkHealth();
  }, []);

  // Load all projects with their notes when component mounts or when projects change
  useEffect(() => {
    if (serverStatus === 'online') {
      loadAllProjectsWithNotes();
    }
  }, [serverStatus, projects]);

  const loadAllProjectsWithNotes = async () => {
    if (isLoadingProjects) return;
    
    setIsLoadingProjects(true);
    try {
      console.log('Loading all projects with notes for AI Assistant...');
      
      // Get fresh project list from backend
      const backendProjects = await getUserProjects();
      
      // Load notes for each project
      const projectsWithNotesPromises = backendProjects.map(async (project) => {
        try {
          const fullProject = await getProjectById(project.id);
          
          // Convert to frontend format
          return {
            id: fullProject.id,
            name: fullProject.name,
            location: fullProject.location || '',
            date: new Date(fullProject.project_date || fullProject.created_at),
            inspector: fullProject.inspector || '',
            createdAt: new Date(fullProject.created_at),
            updatedAt: new Date(fullProject.updated_at || fullProject.created_at),
            notes: (fullProject.notes || []).map((note: any) => ({
              id: note.id,
              type: note.type,
              content: note.content,
              transcription: note.transcription,
              imageLabel: note.image_label,
              timestamp: new Date(note.created_at),
              submitted: note.submitted || false,
              submittedAt: note.submitted_at ? new Date(note.submitted_at) : undefined,
              individualReport: note.individual_report,
              mediaUrl: note.mediaUrl || null,
              fileName: note.fileName || null,
              mimeType: note.mimeType || null,
              fileSize: note.fileSize || null
            })),
            aiSummary: fullProject.ai_summary,
            noteCount: (fullProject.notes || []).length
          };
        } catch (error) {
          console.error(`Failed to load notes for project ${project.id}:`, error);
          // Return project without notes if loading fails
          return {
            id: project.id,
            name: project.name,
            location: project.location || '',
            date: new Date(project.project_date || project.created_at),
            inspector: project.inspector || '',
            createdAt: new Date(project.created_at),
            updatedAt: new Date(project.updated_at || project.created_at),
            notes: [],
            aiSummary: project.ai_summary,
            noteCount: 0
          };
        }
      });
      
      const projectsWithNotesData = await Promise.all(projectsWithNotesPromises);
      setProjectsWithNotes(projectsWithNotesData);
      
      console.log('Loaded projects with notes for AI:', {
        projectCount: projectsWithNotesData.length,
        totalNotes: projectsWithNotesData.reduce((sum, p) => sum + p.notes.length, 0),
        projectsWithNotes: projectsWithNotesData.map(p => ({
          name: p.name,
          noteCount: p.notes.length
        }))
      });
      
    } catch (error) {
      console.error('Failed to load projects with notes:', error);
      // Fallback to projects without notes
      setProjectsWithNotes(projects);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const checkHealth = async () => {
    try {
      const health = await checkServerHealth();
      console.log('Health check response:', health);
      
      if (health.status === 'ok' && health.openai) {
        setServerStatus('online');
        setError('');
      } else {
        setServerStatus('offline');
        setError(health.openai === false ? 'OpenAI API-nyckel saknas eller är ogiltig' : 'Servern är inte tillgänglig');
      }
      if (health.status !== 'ok' || !health.openai) {
        setError('OpenAI API-nyckel saknas eller servern är inte tillgänglig');
      }
    } catch (error) {
      setServerStatus('offline');
      setError('Kan inte ansluta till servern. Kontrollera att backend-servern körs på port 3001.');
    }
    console.log('Health check completed, status:', serverStatus);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || serverStatus !== 'online' || isLoadingProjects) return;

    console.log('=== AI CHAT DEBUG - FRONTEND ===');
    console.log('Projects with notes for AI:', projectsWithNotes.length);
    console.log('Projects data:', projectsWithNotes.map(p => ({
      id: p.id,
      name: p.name,
      location: p.location,
      notesCount: p.notes?.length || 0,
      hasNotes: p.notes && p.notes.length > 0
    })));
    
    // Check if there are any projects or notes to analyze
    const hasProjects = projectsWithNotes.length > 0;
    const hasNotes = projectsWithNotes.some(project => project.notes && project.notes.length > 0);
    
    console.log('Has projects:', hasProjects);
    console.log('Has notes:', hasNotes);

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError('');

    // If no projects exist, provide fallback response
    if (!hasProjects) {
      console.log('No projects found, showing fallback message');
      const fallbackMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Det finns inga sparade projekt ännu som jag kan använda för att svara på din fråga. Skapa projekt för att börja spara information. (Debug: ${projectsWithNotes.length} projekt mottagna)`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, fallbackMessage]);
      setIsLoading(false);
      return;
    }
    
    console.log('Sending chat message to API...');
    try {
      const response = await sendChatMessage(userMessage.content, projectsWithNotes);
      console.log('API response received:', response);
      
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error getting AI response:', error);
      const errorMsg = error instanceof Error ? error.message : 'Okänt fel';
      setError(`Kunde inte få svar från AI-assistenten: ${errorMsg}`);
      
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Jag kan inte svara just nu. Fel: ${errorMsg}. Debug: ${projectsWithNotes.length} projekt, ${projectsWithNotes.reduce((sum, p) => sum + (p.notes?.length || 0), 0)} anteckningar totalt.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Show loading state while checking server or loading projects
  if (serverStatus === 'checking' || (serverStatus === 'online' && isLoadingProjects && projectsWithNotes.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">
            {serverStatus === 'checking' ? 'Kontrollerar AI-tjänst...' : 'Laddar projektdata...'}
          </p>
        </div>
      </div>
    );
  }

  if (serverStatus === 'offline') {
    return (
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-4 py-6">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center mr-3">
              <WifiOff className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI-Assistent</h1>
              <p className="text-sm text-red-600">Inte ansluten</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">AI-tjänsten är inte tillgänglig</h3>
            <p className="text-gray-500 mb-4 text-sm">
              {error || 'Kontrollera att servern körs och att OpenAI API-nyckeln är konfigurerad.'}
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <h4 className="font-medium text-gray-900 mb-2">Felsökning:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>1. Kontrollera att backend-servern körs (npm run dev)</li>
                <li>2. Verifiera att .env filen innehåller OPENAI_API_KEY</li>
                <li>3. Kontrollera att port 3001 är tillgänglig</li>
              </ul>
            </div>
            <button
              onClick={checkHealth}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors"
            >
              Försök igen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-gray-200 px-4 py-6">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center mr-3">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">AI-Assistent</h1>
            <div className="flex items-center">
              <Wifi className="w-4 h-4 text-green-600 mr-1" />
              <p className="text-sm text-green-600">Ansluten</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-b border-red-200 p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8 h-full">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">AI-Assistent</h3>
              <p className="text-gray-500 mb-6">Ställ frågor om alla dina inspektionsprojekt. Jag kan söka igenom alla anteckningar och ge dig svar baserat på din data.</p>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <FolderOpen className="w-5 h-5 text-gray-600 mr-2" />
                  <span className="text-sm font-medium text-gray-700">
                    {projectsWithNotes.length} projekt tillgängliga för analys
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  {projectsWithNotes.reduce((sum, p) => sum + p.notes.length, 0) > 0 
                    ? `Totalt ${projectsWithNotes.reduce((sum, p) => sum + p.notes.length, 0)} anteckningar att söka igenom`
                    : 'Inga anteckningar att analysera ännu'
                  }
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex items-center mb-2">
                      <Bot className="w-4 h-4 mr-2" />
                      <span className="text-xs font-medium text-gray-600">AI-assistent</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-purple-200' : 'text-gray-500'}`}>
                    {message.timestamp.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl px-4 py-3 max-w-[85%]">
                  <div className="flex items-center">
                    <Bot className="w-4 h-4 mr-2" />
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex items-end space-x-3">
          <div className="flex-1">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ställ en fråga om dina projekt..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={1}
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading || serverStatus !== 'online' || isLoadingProjects}
            className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        {/* Show loading indicator when refreshing project data */}
        {isLoadingProjects && (
          <div className="text-center py-2">
            <p className="text-xs text-gray-500">Uppdaterar projektdata...</p>
          </div>
        )}
      </div>
    </div>
  );
};