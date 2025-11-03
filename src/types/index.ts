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
  template?: string | null;
}

export interface TemplateSection {
  id: string;
  template_id: string;
  name: string;
  order_index: number;
  allow_subsections: boolean;
  created_at: Date;
}

export interface Section {
  id: string;
  project_id: string;
  template_section_id?: string | null;
  name: string;
  parent_section_id?: string | null;
  order_index: number;
  created_at: Date;
  template_section_name?: string;
  allow_subsections?: boolean;
  subsections?: Section[];
}

export interface Note {
  id: string;
  type: 'photo' | 'video' | 'text';
  kommentar: string;
  transcription?: string;
  imageLabel?: string;
  delomrade?: string;
  isLabelLoading?: boolean;
  timestamp: Date;
  mediaUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  submitted?: boolean;
  submittedAt?: Date;
  individualReport?: string;
  section_id?: string | null;
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
  organizationId?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Organization {
  id: string;
  name: string;
  role: 'admin' | 'member';
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface OrganizationInvite {
  organizationName: string;
  invitedBy: string;
  email: string;
}