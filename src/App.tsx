import React, { useState, useEffect } from 'react';
import { Project } from './types';
import { ProjectList } from './components/ProjectList';
import { NewProject } from './components/NewProject';
import { ProjectDetail } from './components/ProjectDetail';
import { GlobalAIChat } from './components/GlobalAIChat';
import { loadProjects, saveProjects, populateWithMockData } from './utils/storage';
import { ClipboardList, Plus, FolderOpen, Bot } from 'lucide-react';

type View = 'list' | 'new' | 'detail';
type Tab = 'projects' | 'ai';

function App() {
  const [currentView, setCurrentView] = useState<View>('list');
  const [activeTab, setActiveTab] = useState<Tab>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  useEffect(() => {
    let savedProjects = loadProjects();
    
    // If no projects exist, populate with mock data
    if (savedProjects.length === 0) {
      savedProjects = populateWithMockData();
    }
    
    setProjects(savedProjects);
  }, []);

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
    <div className="h-screen bg-gray-50 flex flex-col relative">
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'projects' && (
          <>
            {currentView === 'list' && (
              <>
                <div className="bg-white border-b border-gray-200 px-4 py-6 flex-shrink-0">
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
                    <button
                      onClick={() => setCurrentView('new')}
                      className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors shadow-lg"
                    >
                      <Plus className="w-6 h-6" />
                    </button>
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
          <div className="h-full">
            <GlobalAIChat projects={projects} />
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 safe-area-pb z-50 flex-shrink-0">
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