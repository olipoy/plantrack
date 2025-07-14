import React from 'react';
import { Project } from '../types';
import { FileText, MapPin, Calendar, ChevronRight, User } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({ projects, onSelectProject }) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('sv-SE', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Inga projekt än</h3>
          <p className="text-gray-500">Skapa ditt första inspektionsprojekt för att komma igång.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4">
      {projects.map((project) => (
        <div
          key={project.id}
          onClick={() => onSelectProject(project)}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow duration-200 active:scale-98"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate text-lg">
                {project.name}
              </h3>
              <div className="flex items-center text-gray-500 text-sm mt-1">
                <MapPin className="w-4 h-4 mr-1 flex-shrink-0" />
                <span className="truncate">{project.location}</span>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center text-gray-500 text-sm">
                  <Calendar className="w-4 h-4 mr-1" />
                  <span>{formatDate(project.date)}</span>
                </div>
                <div className="flex items-center text-gray-500 text-sm">
                  <User className="w-4 h-4 mr-1" />
                  <span className="truncate">{project.inspector}</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 mr-2">
                    {project.notes.length} anteckningar
                  </span>
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 text-xs font-medium">
                      {project.notes.length}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-gray-400">
                  Uppdaterad {formatDate(project.updatedAt)}
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 ml-3 flex-shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
};