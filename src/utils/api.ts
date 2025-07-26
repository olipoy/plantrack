// API configuration for different environments
import { getToken } from './auth';

const getApiBaseUrl = () => {
  // In development, use local server
  if (import.meta.env.DEV) {
    return 'http://localhost:3001/api';
  }
  
  // In production, check for explicit API URL first
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}/api`;
  }
  
  // Fallback to same origin (for Railway deployment where frontend and backend are served together)
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();

export interface UploadResponse {
  success: boolean;
  fileUrl: string;
  transcription?: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface ChatResponse {
  response: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export const uploadFile = async (
  file: File,
  projectId: string,
  noteType: string,
  onProgress?: (progress: number) => void
): Promise<UploadResponse> => {
  return new Promise((resolve, reject) => {
    const token = getToken();
    if (!token) {
      reject(new Error('Authentication required'));
      return;
    }

    console.log('Starting upload with token:', token ? 'Present' : 'Missing');
    console.log('Upload details:', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      projectId,
      noteType
    });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('noteType', noteType);

    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          onProgress(progress);
        }
      });
    }

    xhr.addEventListener('load', () => {
      console.log('Upload response status:', xhr.status);
      console.log('Upload response text:', xhr.responseText);
      
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (error) {
          console.error('JSON parse error:', error);
          reject(new Error('Invalid response format'));
        }
      } else if (xhr.status === 401) {
        reject(new Error('Authentication expired. Please log in again.'));
      } else if (xhr.status === 500) {
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          reject(new Error(errorResponse.error || 'Server error occurred'));
        } catch {
          reject(new Error('Server error occurred. Please try again.'));
        }
      } else {
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          reject(new Error(errorResponse.error || `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      console.error('Network error during upload');
      reject(new Error('Network error during upload'));
    });

    xhr.open('POST', `${API_BASE_URL}/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
};

export const sendChatMessage = async (
  message: string,
  projects: any[],
  userId?: string
): Promise<ChatResponse> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  console.log('=== API CHAT DEBUG ===');
  console.log('Sending to API:', {
    message: message.substring(0, 100),
    projectsCount: projects.length,
    projectsData: projects.map(p => ({
      id: p.id,
      name: p.name,
      notesCount: p.notes?.length || 0
    }))
  });

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      projects,
      userId
    }),
  });

  console.log('API response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API error response:', errorText);
    throw new Error(`Chat request failed: ${response.statusText}`);
  }

  const result = await response.json();
  console.log('API response data:', result);
  return result;
};

export const summarizeNotes = async (
  projectId: string
): Promise<{ summary: string }> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  console.log('Sending summarization request for project:', projectId);

  const response = await fetch(`${API_BASE_URL}/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      projectId
    }),
  });

  console.log('Summarization response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Summarization error response:', errorText);
    throw new Error(`Summarization failed (${response.status}): ${response.statusText}`);
  }

  const result = await response.json();
  console.log('Summarization result:', result);
  return result;
};

export const updateNoteLabel = async (
  noteId: string,
  label: string
): Promise<any> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${API_BASE_URL}/notes/${noteId}/label`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ label }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update note label: ${response.statusText}`);
  }

  return response.json();
};

export const generateIndividualReport = async (
  noteId: string
): Promise<{ report: string }> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${API_BASE_URL}/notes/${noteId}/generate-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to generate individual report: ${response.statusText}`);
  }

  return response.json();
};

export const submitIndividualReport = async (
  noteId: string,
  to: string,
  subject: string,
  customMessage?: string
): Promise<{ success: boolean; message: string }> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${API_BASE_URL}/notes/${noteId}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      subject,
      customMessage
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to submit individual report: ${response.statusText}`);
  }

  return response.json();
};

export const sendEmailWithPDF = async (
  to: string,
  subject: string,
  pdfBuffer: string,
  fileName: string,
  text?: string,
  projectId?: string
): Promise<{ success: boolean; message: string }> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${API_BASE_URL}/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      subject,
      text,
      pdfBuffer,
      fileName,
      projectId
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Email sending failed: ${response.statusText}`);
  }

  return response.json();
};

export const checkServerHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    return { 
      status: 'error', 
      message: 'Failed to connect to backend API' 
    };
  }
};

// Project API functions
export const createProject = async (
  name: string,
  location: string,
  date: Date,
  inspector: string
): Promise<any> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${API_BASE_URL}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      location,
      projectDate: date.toISOString(),
      inspector
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to create project: ${response.statusText}`);
  }

  return response.json();
};

export const getUserProjects = async (): Promise<any[]> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${API_BASE_URL}/projects`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get projects: ${response.statusText}`);
  }

  return response.json();
};

export const getProjectById = async (projectId: string): Promise<any> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  console.log('Fetching project details for ID:', projectId);

  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    console.error('Failed to get project:', response.status, response.statusText);
    throw new Error(`Failed to get project: ${response.statusText}`);
  }

  const project = await response.json();
  console.log('Project details received:', project);
  return project;
};

export const deleteProject = async (projectId: string): Promise<void> => {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete project: ${response.statusText}`);
  }
};