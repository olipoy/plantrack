// API configuration for different environments
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
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (error) {
          reject(new Error('Invalid response format'));
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.open('POST', `${API_BASE_URL}/upload`);
    xhr.send(formData);
  });
};

export const sendChatMessage = async (
  message: string,
  projects: any[],
  userId?: string
): Promise<ChatResponse> => {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      projects,
      userId
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.statusText}`);
  }

  return response.json();
};

export const summarizeNotes = async (
  notes: string[],
  projectName: string,
  projectLocation: string
): Promise<{ summary: string }> => {
  const response = await fetch(`${API_BASE_URL}/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      notes,
      projectName,
      projectLocation
    }),
  });

  if (!response.ok) {
    throw new Error(`Summarization failed: ${response.statusText}`);
  }

  return response.json();
};

export const sendEmailWithPDF = async (
  to: string,
  subject: string,
  pdfBuffer: string,
  fileName: string,
  text?: string
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      subject,
      text,
      pdfBuffer,
      fileName
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