import React, { useState, useEffect } from 'react';
import { Project } from './types';
import { ProjectList } from './components/ProjectList';
import { NewProject } from './components/NewProject';
import { ProjectDetail } from './components/ProjectDetail';
import { GlobalAIChat } from './components/GlobalAIChat';
import { AuthForm } from './components/AuthForm';
import { loadProjects, saveProjects, populateWithMockData } from './utils/storage';
import { ClipboardList, Plus, FolderOpen, Bot, LogOut, User } from 'lucide-react';
import { isAuthenticated, getUser, logout } from './utils/auth';

type View = 'list' | 'new' | 'detail';
type Tab = 'projects' | 'ai';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [currentView, setCurrentView] = useState<View>('list');
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

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
    
    let savedProjects = loadProjects();
    
    // If no projects exist, populate with mock data
    if (savedProjects.length === 0) {
      savedProjects = populateWithMockData();
    }
    
    setProjects(savedProjects);
  }, [isLoggedIn]);

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

  // Show loading while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Laddar...</p>
        </div>
      </div>
    );
  }

  // Show auth form if not logged in
  if (!isLoggedIn) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  const handleProjectCreated = (project: Project) => {
    const updatedProjects = [...projects, project];
    setProjects(updatedProjects);
    saveProjects(updatedProjects);
    setSelectedProject(project);
    setCurrentView('detail');
  };

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setCurrentView('detail');
  };

  const handleProjectUpdate = (updatedProject: Project) => {
    const updatedProjects = projects.map(p => 
      p.id === updatedProject.id ? updatedProject : p
    );
    setProjects(updatedProjects);
    saveProjects(updatedProjects);
    setSelectedProject(updatedProject);
  };

  const handleProjectDelete = () => {
    const updatedProjects = loadProjects(); // Reload from storage after deletion
    setProjects(updatedProjects);
    setCurrentView('list');
    setSelectedProject(null);
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
                      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mr-3">
                        <ClipboardList className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h1 className="text-xl font-bold text-gray-900">Inspektionsassistent</h1>
                        <p className="text-sm text-gray-500">AI-driven facilitetsinspektioner</p>
                      </div>
                    </div>
                   <div className="flex items-center space-x-2">
                     <div className="flex items-center text-sm text-gray-600 mr-3">
                       <User className="w-4 h-4 mr-1" />
                       <span>{getUser()?.name}</span>
                     </div>
                     <button
                       onClick={handleLogout}
                       className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                       title="Logga ut"
                     >
                       <LogOut className="w-5 h-5" />
                     </button>
                     <button
                       onClick={() => setCurrentView('new')}
                       className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors shadow-lg"
                     >
                       <Plus className="w-6 h-6" />
                     </button>
                   </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <ProjectList projects={projects} onSelectProject={handleSelectProject} />
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
              />
            )}
          </>
        )}

        {activeTab === 'ai' && (
          <div className="flex-1 flex flex-col min-h-0">
            <GlobalAIChat projects={projects} />
          </div>
        )}
      </div>

      {/* Footer Navigation */}
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
    </div>
  );
}

export default App;