import { Project, Note } from '../types';

const STORAGE_KEY = 'inspection-projects';
const CHAT_HISTORY_KEY = 'ai-chat-history';

export const saveProjects = (projects: Project[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
};

export const saveChatHistory = (messages: any[]) => {
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
};

export const loadChatHistory = () => {
  const stored = localStorage.getItem(CHAT_HISTORY_KEY);
  if (!stored) return [];
  
  const messages = JSON.parse(stored);
  return messages.map((m: any) => ({
    ...m,
    timestamp: new Date(m.timestamp)
  }));
};

export const loadProjects = (): Project[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  
  const projects = JSON.parse(stored);
  return projects.map((p: any) => ({
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
    date: new Date(p.date),
    notes: p.notes.map((n: any) => ({
      ...n,
      timestamp: new Date(n.timestamp)
    }))
  }));
};

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const createProject = (name: string, location: string, date: Date, inspector: string): Project => {
  return {
    id: generateId(),
    name,
    location: shortenAddress(location),
    date,
    inspector,
    createdAt: new Date(),
    updatedAt: new Date(),
    notes: []
  };
};

export const addNoteToProject = (projectId: string, note: Omit<Note, 'id'>): Project[] => {
  const projects = loadProjects();
  const projectIndex = projects.findIndex(p => p.id === projectId);
  
  if (projectIndex === -1) return projects;
  
  const newNote: Note = {
    ...note,
    id: generateId()
  };
  
  projects[projectIndex].notes.push(newNote);
  projects[projectIndex].updatedAt = new Date();
  
  saveProjects(projects);
  return projects;
};

export const deleteNoteFromProject = (projectId: string, noteId: string): Project[] => {
  const projects = loadProjects();
  const projectIndex = projects.findIndex(p => p.id === projectId);
  
  if (projectIndex === -1) return projects;
  
  projects[projectIndex].notes = projects[projectIndex].notes.filter(n => n.id !== noteId);
  projects[projectIndex].updatedAt = new Date();
  
  saveProjects(projects);
  return projects;
};

export const deleteProject = (projectId: string): Project[] => {
  const projects = loadProjects();
  const filteredProjects = projects.filter(p => p.id !== projectId);
  saveProjects(filteredProjects);
  return filteredProjects;
};

// Simple address shortening - just take first 2-3 parts
export const shortenAddress = (fullAddress: string): string => {
  const parts = fullAddress.split(',').map(part => part.trim());
  
  if (parts.length <= 2) {
    return fullAddress;
  }
  
  // Take first 2-3 parts depending on content
  if (parts.length >= 3) {
    return parts.slice(0, 3).join(', ');
  }
  
  return parts.slice(0, 2).join(', ');
};

// Mock data population function
export const populateWithMockData = () => {
  // Only create sample projects for new users
  const existingProjects = loadProjects();
  if (existingProjects.length > 0) {
    return existingProjects;
  }

  // Create just 2 sample projects for new users
  const sampleProjects: Project[] = [
    {
      id: 'sample-project-1',
      name: 'Kontorsbyggnad A - Ventilationsinspektion',
      location: 'Falköpingsvägen 8, Hammarbyhöjden',
      date: new Date('2024-12-15'),
      inspector: 'Anna Andersson',
      createdAt: new Date('2024-12-15T08:30:00'),
      updatedAt: new Date('2024-12-15T14:45:00'),
      aiSummary: `**INSPEKTIONSSAMMANFATTNING**

**Övergripande status:** Godkänd med mindre åtgärder

**Identifierade problem:**
• Ventilationsfläkt i källaren (Fläkt B-02) visar onormala vibrationer
• Filter i trapphus C behöver bytas inom 2 veckor
• Mindre läckage upptäckt vid rörgenomföring på våning 3

**Kontrollerade system:**
✓ Ventilationssystem - Huvudsakligen funktionellt
✓ Brandskyddssystem - Alla detektorer testade och godkända
✓ Elektriska installationer - Inga avvikelser
✓ Rörledningar - Mindre åtgärd krävs

**Rekommenderade åtgärder:**
1. Byt filter i trapphus C (prioritet: hög)
2. Service av fläkt B-02 (prioritet: medium)
3. Täta rörgenomföring våning 3 (prioritet: låg)

**Nästa inspektion:** Rekommenderas inom 6 månader`,
      notes: [
        {
          id: 'sample-note-1',
          type: 'photo',
          content: 'Foto av ventilationsfläkt',
          transcription: '',
          timestamp: new Date('2024-12-15T09:15:00'),
          fileUrl: 'https://images.pexels.com/photos/159045/the-interior-of-the-repair-interior-design-159045.jpeg?auto=compress&cs=tinysrgb&w=800',
          fileName: 'ventilation_flakt_001.jpg',
          fileSize: 2456789
        },
        {
          id: 'sample-note-2',
          type: 'video',
          content: 'Videoinspelning av fläktljud',
          transcription: 'Här hör vi fläkten som låter ovanligt högt. Det verkar vara vibrationer från lagret. Jag rekommenderar att vi byter ut lagret inom de närmaste veckorna. Ljudnivån är betydligt högre än normalt och det kan tyda på att lagret håller på att gå sönder.',
          timestamp: new Date('2024-12-15T09:30:00'),
          fileUrl: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
          fileName: 'flakt_ljud_inspektion.mp4',
          fileSize: 8934567
        },
        {
          id: 'sample-note-3',
          type: 'photo',
          content: 'Filter som behöver bytas',
          transcription: '',
          timestamp: new Date('2024-12-15T10:45:00'),
          fileUrl: 'https://images.pexels.com/photos/4792509/pexels-photo-4792509.jpeg?auto=compress&cs=tinysrgb&w=800',
          fileName: 'filter_trapphus_c.jpg',
          fileSize: 1876543
        },
        {
          id: 'sample-note-4',
          type: 'video',
          content: 'Branddetektortest',
          transcription: 'Nu testar vi branddetektorn i korridoren på våning två. Som ni hör så fungerar larmet perfekt. Detektorn reagerar snabbt på teströk och ljudnivån är tillräcklig. Alla branddetektorer i byggnaden har testats och godkänts enligt gällande säkerhetsföreskrifter.',
          timestamp: new Date('2024-12-15T11:20:00'),
          fileUrl: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_2mb.mp4',
          fileName: 'branddetektortest_v2.mp4',
          fileSize: 12456789
        },
        {
          id: 'sample-note-5',
          type: 'photo',
          content: 'Läckage vid rörgenomföring',
          transcription: '',
          timestamp: new Date('2024-12-15T12:10:00'),
          fileUrl: 'https://images.pexels.com/photos/8293778/pexels-photo-8293778.jpeg?auto=compress&cs=tinysrgb&w=800',
          fileName: 'lackage_ror_v3.jpg',
          fileSize: 2234567
        },
        {
          id: 'sample-note-6',
          type: 'video',
          content: 'Genomgång av elcentral',
          transcription: 'Här går vi igenom elcentralen på bottenvåningen. Alla säkringar är märkta korrekt och det finns inga tecken på överhettning eller korrosion. Jordfelsbryterna fungerar som de ska och har testats. Installationen följer gällande elstandard och är i gott skick.',
          timestamp: new Date('2024-12-15T13:30:00'),
          fileUrl: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
          fileName: 'elcentral_genomgang.mp4',
          fileSize: 7654321
        },
        {
          id: 'sample-note-7',
          type: 'photo',
          content: 'Slutkontroll ventilationsschema',
          transcription: '',
          timestamp: new Date('2024-12-15T14:15:00'),
          fileUrl: 'https://images.pexels.com/photos/5691659/pexels-photo-5691659.jpeg?auto=compress&cs=tinysrgb&w=800',
          fileName: 'ventilationsschema_final.jpg',
          fileSize: 3456789
        }
      ]
    },
    {
      id: 'sample-project-2',
      name: 'Restaurang Kök - Säkerhetsinspektion',
      location: 'Drottninggatan 42, Stockholm',
      date: new Date('2024-12-10'),
      inspector: 'Erik Johansson',
      createdAt: new Date('2024-12-10T07:00:00'),
      updatedAt: new Date('2024-12-10T16:30:00'),
      notes: [
        {
          id: 'sample-note-8',
          type: 'photo',
          content: 'Köksutrustning översikt',
          transcription: '',
          timestamp: new Date('2024-12-10T08:00:00'),
          fileUrl: 'https://images.pexels.com/photos/2696064/pexels-photo-2696064.jpeg?auto=compress&cs=tinysrgb&w=800',
          fileName: 'kok_oversikt.jpg',
          fileSize: 3234567
        },
        {
          id: 'sample-note-9',
          type: 'video',
          content: 'Brandskyddssystem test',
          transcription: 'Vi testar nu sprinklersystemet i köket. Systemet aktiveras korrekt vid 68 grader och vattentrycket är optimalt. Alla munstycken är rena och fria från blockering. Brandskyddssystemet uppfyller alla säkerhetskrav för kommersiella kök.',
          timestamp: new Date('2024-12-10T09:30:00'),
          fileUrl: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
          fileName: 'sprinkler_test.mp4',
          fileSize: 9876543
        }
      ]
    }
  ];

  saveProjects(sampleProjects);
  return sampleProjects;
};