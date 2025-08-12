import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Project } from './types';
import { ProjectList } from './components/ProjectList';
import { NewProject } from './components/NewProject';
import { ProjectDetail } from './components/ProjectDetail';
import { GlobalAIChat } from './components/GlobalAIChat';
import { AuthForm } from './components/AuthForm';
import { InviteAcceptPage } from './components/InviteAcceptPage';
import { OrganizationSettings } from './components/OrganizationSettings';
import { SharePage } from './components/SharePage';
import { populateWithMockData } from './utils/storage';
import { getUserProjects, getProjectById } from './utils/api';
import { ClipboardList, Plus, FolderOpen, Bot, LogOut, User, Settings, X } from 'lucide-react';
import { isAuthenticated, getUser, logout } from './utils/auth';

type View = 'list' | 'new' | 'detail' | 'organization-settings';
type Tab = 'projects' | 'ai';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/login" element={<AuthForm onAuthSuccess={() => window.location.href = '/'} />} />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </Router>
  );
}

function MainApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [currentView, setCurrentView] = useState<View>('list');
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [pendingEmailData, setPendingEmailData] = useState<any>(null);

  useEffect(() => {
    // Check authentication status
    const checkAuth = () => {
      setIsLoggedIn(isAuthenticated());
      setIsCheckingAuth(false);
    };
    
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    
    const loadUserProjects = async () => {
      try {
        console.log('Loading user projects from backend...');
        const backendProjects = await getUserProjects();
        console.log('Backend projects received:', backendProjects);
        
        // Convert backend projects to frontend format
        const formattedProjects: Project[] = backendProjects.map(p => ({
          id: p.id,
          name: p.name,
          location: p.location || '',
          date: new Date(p.project_date || p.created_at),
          inspector: p.inspector || '',
          createdAt: new Date(p.created_at),
          updatedAt: new Date(p.updated_at || p.created_at),
          notes: [], // Notes will be loaded when project is selected
          aiSummary: p.ai_summary,
          noteCount: p.note_count || 0
        }));
        
        console.log('Formatted projects:', formattedProjects);
        
        // If no projects exist, add sample projects for demo
        if (formattedProjects.length === 0) {
          console.log('No projects found, loading sample data');
          const sampleProjects = populateWithMockData();
          setProjects(sampleProjects);
        } else {
          console.log('Setting projects from backend');
          setProjects(formattedProjects);
        }
      } catch (error) {
        console.error('Error loading projects:', error);
        // Fallback to sample projects if API fails
        const sampleProjects = populateWithMockData();
        setProjects(sampleProjects);
      }
    };
    
    loadUserProjects();
  }, [isLoggedIn]);

  const handleProjectCreated = (project: Project) => {
    setProjects(prev => [project, ...prev]);
    setSelectedProject(project);
    setCurrentView('detail');
  };

  const handleProjectUpdate = (updatedProject: Project) => {
    console.log('Updating project:', updatedProject);
    console.log('Updated project notes count:', updatedProject.notes?.length || 0);
    console.log('Current projects state count:', projects.length);
    
    setProjects(prev => prev.map(p => 
      p.id === updatedProject.id ? updatedProject : p
    ));
    
    // Also update the selectedProject to ensure ProjectDetail gets the latest data
    setSelectedProject(updatedProject);
    
    console.log('Project state updated, selectedProject updated');
    // Don't clear pendingEmailData here to avoid interference
  };

  const handleProjectDelete = async () => {
    try {
      // Reload projects from backend after deletion
      const backendProjects = await getUserProjects();
      const formattedProjects: Project[] = backendProjects.map(p => ({
        id: p.id,
        name: p.name,
        location: p.location || '',
        date: new Date(p.project_date || p.created_at),
        inspector: p.inspector || '',
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at || p.created_at),
        notes: [],
        aiSummary: p.ai_summary
      }));
      setProjects(formattedProjects);
    } catch (error) {
      console.error('Error reloading projects after delete:', error);
      // Remove from local state as fallback
      setProjects(prev => prev.filter(p => p.id !== selectedProject?.id));
    }
    
    setCurrentView('list');
    setSelectedProject(null);
  };

  const handleAuthSuccess = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
    setCurrentView('list');
    setSelectedProject(null);
    setProjects([]);
  };

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  // Show loading while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Laddar...</p>
      </div>
    );
  }

  // Show auth form if not logged in
  if (!isLoggedIn) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  const handleSelectProject = (project: Project) => {
    console.log('Selecting project:', project.id);
    // Load full project details including notes from backend
    const loadProjectDetails = async () => {
      try {
        console.log('Loading project details from backend...');
        const fullProject = await getProjectById(project.id);
        console.log('Full project data received:', fullProject);
        
        // Convert backend project to frontend format
        const formattedProject: Project = {
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
            isLabelLoading: note.type === 'photo' && !note.image_label,
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
        
        console.log('Formatted project with notes:', formattedProject);
        console.log('Number of notes:', formattedProject.notes.length);
        
        setSelectedProject(formattedProject);
        setCurrentView('detail');
      } catch (error) {
        console.error('Error loading project details:', error);
        // Fallback to basic project info
        setSelectedProject(project);
        setCurrentView('detail');
      }
    };
    
    loadProjectDetails();
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setSelectedProject(null);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'projects') {
      setCurrentView('list');
      setSelectedProject(null);
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {activeTab === 'projects' && (
          <>
            {currentView === 'list' && (
              <>
                <div className="bg-white border-b border-gray-200 px-4 py-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {/* User Profile Icon */}
                      <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center mr-3 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
                      >
                        {getUserInitials(getUser()?.name || '')}
                      </button>
                      <div>
                        <h1 className="text-xl font-bold text-gray-900">Projekt</h1>
                      </div>
                    </div>
                    <div className="flex items-center">
                      {/* New Project Button */}
                      <button
                        onClick={() => setCurrentView('new')}
                        className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors shadow-lg"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Full Screen Navigation Modal */}
                {showUserMenu && (
                  <div className="fixed inset-0 bg-white z-50 flex flex-col">
                    {/* Modal Header */}
                    <div className="bg-white border-b border-gray-200 px-4 py-6">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => setShowUserMenu(false)}
                          className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <X className="w-5 h-5 text-gray-600" />
                        </button>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">Meny</h2>
                        </div>
                        <div className="w-10" />
                      </div>
                    </div>
                    
                    {/* Modal Content */}
                    <div className="flex-1 p-6">
                      {/* User Info Section */}
                      <div className="bg-gray-50 rounded-xl p-4 mb-6">
                        <div className="flex items-center mb-3">
                          <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center mr-3 text-white text-sm font-medium">
                            {getUserInitials(getUser()?.name || '')}
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{getUser()?.name}</h3>
                            <p className="text-sm text-gray-600">{getUser()?.email}</p>
                          </div>
                        </div>
                      </div>
                      
                        {/* Navigation Options */}
                        <div className="space-y-2">
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              setCurrentView('organization-settings');
                            }}
                            className="w-full flex items-center p-4 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                          >
                            <Settings className="w-5 h-5 mr-3" />
                            <span className="font-medium">Organisationsinställningar</span>
                          </button>
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              handleLogout();
                            }}
                            className="w-full flex items-center p-4 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                          >
                            <LogOut className="w-5 h-5 mr-3" />
                            <span className="font-medium">Logga ut</span>
                          </button>
                        </div>
                      </div>
                  </div>
                )}
                
                <div className="flex-1 overflow-y-auto">
                  <ProjectList 
                    projects={projects} 
                    onSelectProject={handleSelectProject}
                    onProjectDeleted={handleProjectDelete}
                  />
                </div>
              </>
            )}

            {currentView === 'new' && (
              <NewProject onBack={handleBackToList} onProjectCreated={handleProjectCreated} />
            )}

            {currentView === 'detail' && selectedProject && (
              <ProjectDetail
                project={selectedProject}
                onBack={handleBackToList}
                onProjectUpdate={handleProjectUpdate}
                onProjectDelete={handleProjectDelete}
                pendingEmailData={pendingEmailData}
                onEmailDataProcessed={() => setPendingEmailData(null)}
              />
            )}

            {currentView === 'organization-settings' && (
              <OrganizationSettings onBack={handleBackToList} />
            )}
          </>
        )}

        {activeTab === 'ai' && (
          <div className="flex-1 flex flex-col min-h-0">
            <GlobalAIChat projects={projects} />
          </div>
        )}
      </div>

      {/* Footer Navigation - Only show when not in project detail */}
      {!(activeTab === 'projects' && (currentView === 'detail' || currentView === 'organization-settings')) && (
        <div className="bg-white border-t border-gray-200 px-4 py-2 safe-area-pb flex-shrink-0">
          <div className="flex">
            <button
              onClick={() => handleTabChange('projects')}
              className={`flex-1 flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
                activeTab === 'projects'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FolderOpen className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Projekt</span>
            </button>
            <button
              onClick={() => handleTabChange('ai')}
              className={`flex-1 flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
                activeTab === 'ai'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Bot className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">AI Assistent</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;