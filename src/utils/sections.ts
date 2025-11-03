import { TemplateSection, Section } from '../types';
import { getAuthToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function getTemplateSections(templateId: string): Promise<TemplateSection[]> {
  const token = getAuthToken();
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
  const token = getAuthToken();
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
  const token = getAuthToken();
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
  const token = getAuthToken();
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
  const token = getAuthToken();
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
    sectionMap.set(section.id, { ...section, subsections: [] });
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
