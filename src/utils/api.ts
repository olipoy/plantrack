// For GitHub Pages deployment, we need to handle the case where no backend is available
const API_BASE_URL = import.meta.env.DEV 
  ? 'http://localhost:3001/api' 
  : import.meta.env.VITE_API_URL || null; // Use environment variable or null for static hosting

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

// Check if API is available
export const isApiAvailable = () => {
  return API_BASE_URL !== null;
};

export const uploadFile = async (
  file: File,
  projectId: string,
  noteType: string,
  onProgress?: (progress: number) => void
): Promise<UploadResponse> => {
  if (!isApiAvailable()) {
    throw new Error('API not available. Please configure VITE_API_URL environment variable or host the backend separately.');
  }

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
  if (!isApiAvailable()) {
    throw new Error('AI chat is not available. Please configure your backend API.');
  }

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
  if (!isApiAvailable()) {
    throw new Error('Note summarization is not available. Please configure your backend API.');
  }

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

export const checkServerHealth = async () => {
  if (!isApiAvailable()) {
    return { 
      status: 'unavailable', 
      message: 'Backend API not configured for static hosting' 
    };
  }

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