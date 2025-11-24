import { TemplateSection, Section } from '../types';
import { getToken } from './auth';

const getApiBaseUrl = () => {
  // In development, use local server
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }

  // In production, check for explicit API URL first
  if (import.meta.env.VITE_API_URL) {
    const apiUrl = import.meta.env.VITE_API_URL;
    // Clean up the URL to avoid double slashes
    return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  }

  // Fallback to same origin (for Railway deployment where frontend and backend are served together)
  return '';
};

const API_URL = getApiBaseUrl();

export async function getTemplateSections(templateId: string): Promise<TemplateSection[]> {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/templates/${templateId}/sections`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch template sections');
  }

  return response.json();
}

export async function getProjectSections(projectId: string): Promise<Section[]> {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/projects/${projectId}/sections`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch project sections');
  }

  return response.json();
}

export async function createSection(
  projectId: string,
  data: {
    templateSectionId?: string;
    name: string;
    parentSectionId?: string;
    orderIndex?: number;
  }
): Promise<Section> {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/projects/${projectId}/sections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error('Failed to create section');
  }

  return response.json();
}

export async function updateSection(
  sectionId: string,
  data: {
    name?: string;
    orderIndex?: number;
  }
): Promise<Section> {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/sections/${sectionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error('Failed to update section');
  }

  return response.json();
}

export async function deleteSection(sectionId: string): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/sections/${sectionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to delete section');
  }
}

export function organizeSectionsHierarchy(sections: Section[]): Section[] {
  const sectionMap = new Map<string, Section>();
  const rootSections: Section[] = [];

  sections.forEach(section => {
    // Preserve existing subsections array (from subsections table), but initialize to empty array if not present
    sectionMap.set(section.id, { ...section, subsections: section.subsections || [] });
  });

  sections.forEach(section => {
    const sectionWithSubsections = sectionMap.get(section.id)!;

    if (section.parent_section_id) {
      const parent = sectionMap.get(section.parent_section_id);
      if (parent) {
        parent.subsections = parent.subsections || [];
        parent.subsections.push(sectionWithSubsections);
      }
    } else {
      rootSections.push(sectionWithSubsections);
    }
  });

  rootSections.forEach(section => {
    if (section.subsections) {
      section.subsections.sort((a, b) => a.order_index - b.order_index);
    }
  });

  return rootSections.sort((a, b) => a.order_index - b.order_index);
}
