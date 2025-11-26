import React from 'react';
import { Project } from '../types';
import { FileText, MapPin, Calendar, ChevronRight, User, MoreVertical, Trash2, File } from 'lucide-react';
import { deleteProject } from '../utils/api';

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onProjectDeleted: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({ projects, onSelectProject, onProjectDeleted }) => {
  const [showDeleteMenu, setShowDeleteMenu] = React.useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState<string | null>(null);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('sv-SE', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProject(projectId);
      onProjectDeleted();
      setShowDeleteConfirm(null);
      setShowDeleteMenu(null);
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Kunde inte ta bort projektet. Försök igen.');
    }
  };

  const handleMenuClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setShowDeleteMenu(showDeleteMenu === projectId ? null : projectId);
  };

  const handleDeleteClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setShowDeleteConfirm(projectId);
  };

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Inga projekt än</h3>
          <p className="text-gray-500">Skapa ditt första inspektionsprojekt för att komma igång.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {projects.map((project) => (
        <div
          key={project.id}
          onClick={() => onSelectProject(project)}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow duration-200 active:scale-98"
        >
          <div className="relative">
            {/* Header with title and menu */}
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900 truncate text-lg">
                {project.name}
              </h3>
              <div className="flex items-center ml-3 flex-shrink-0">
                <div className="relative">
                  <button
                    onClick={(e) => handleMenuClick(e, project.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {/* Dropdown Menu */}
                  {showDeleteMenu === project.id && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[120px]">
                      <button
                        onClick={(e) => handleDeleteClick(e, project.id)}
                        className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Ta bort
                      </button>
                    </div>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 ml-1" />
              </div>
            </div>
            
            {/* Project details */}
            {project.type === 'pdfOverlay' ? (
              <div className="space-y-2">
                <div className="flex items-center text-gray-500 text-sm mt-1">
                  <File className="w-4 h-4 mr-1 flex-shrink-0" />
                  <span className="truncate">PDF-mallprojekt</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-gray-500 text-sm">
                    <Calendar className="w-4 h-4 mr-1" />
                    <span>{formatDate(project.date)}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    Uppdaterad {formatDate(project.updatedAt)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center text-gray-500 text-sm mt-1">
                  <MapPin className="w-4 h-4 mr-1 flex-shrink-0" />
                  <span className="truncate">{project.location}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-gray-500 text-sm">
                    <Calendar className="w-4 h-4 mr-1" />
                    <span>{formatDate(project.date)}</span>
                  </div>
                  <div className="flex items-center text-gray-500 text-sm">
                    <User className="w-4 h-4 mr-1" />
                    <span className="truncate">{project.inspector}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 mr-2">
                      {project.noteCount || project.notes.length} anteckningar
                    </span>
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 text-xs font-medium">
                        {project.noteCount || project.notes.length}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    Uppdaterad {formatDate(project.updatedAt)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Ta bort projekt</h3>
            <p className="text-gray-600 mb-6">
              Är du säker på att du vill ta bort detta projekt? Detta kan inte ångras.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(null);
                  setShowDeleteMenu(null);
                }}
                className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={() => handleDeleteProject(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Ta bort
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};