export interface Project {
  id: string;
  name: string;
  location: string;
  date: Date;
  inspector: string;
  createdAt: Date;
  updatedAt: Date;
  notes: Note[];
  aiSummary?: string;
  noteCount?: number;
}

export interface Note {
  id: string;
  type: 'photo' | 'video' | 'text';
  content: string;
  transcription?: string;
  imageLabel?: string;
  isLabelLoading?: boolean;
  timestamp: Date;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  submitted?: boolean;
  submittedAt?: Date;
  individualReport?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}