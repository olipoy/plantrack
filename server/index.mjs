import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import sgMail from '@sendgrid/mail';

// Polyfill for OpenAI library File upload support
import { File } from 'node:buffer';
globalThis.File = File;

// Import authentication and database modules (ESM)
import { authenticateToken, registerUser, loginUser } from './auth.js';
import { projectDb, noteDb, summaryDb } from './db.js';

// Load environment variables
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fix uploads directory path for production
const uploadsDir = NODE_ENV === 'production' 
  ? join(process.cwd(), 'server', 'uploads')  // /app/server/uploads in production
  : join(__dirname, 'uploads');               // ./server/uploads in development

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}
// Initialize AWS S3 (optional)
let s3 = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  });
  s3 = new AWS.S3();
}

// Middleware
function cleanEnvUrl(url) {
  if (!url) return null;
  return url.trim()
    .replace(/[;,\s]+$/g, '')    // remove trailing garbage
    .replace(/\/+$/, '')         // remove trailing slashes
    .replace(/^http(s?):\/\//, 'https://'); // enforce https
}

const ALLOWED_ORIGINS = [
  'https://plantrack-production.up.railway.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Authentication Routes

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Basic validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const result = await registerUser(email, password, name);
    res.status(201).json(result);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await loginUser(email, password);
    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: error.message });
  }
});

// Get current user info
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Project Routes (Protected)

// Create new project
app.post('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { name, description, location, inspector, projectDate } = req.body;
    
    console.log('Creating project:', { name, description, location, inspector, projectDate, userId: req.user.id });
    
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await projectDb.createProject(
      req.user.id,
      name,
      description || null,
      location || '',
      inspector || '',
      projectDate ? new Date(projectDate) : new Date()
    );

    console.log('Project created successfully:', project);
    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ 
      error: 'Failed to create project',
      details: error.message 
    });
  }
});

// Get all projects for current user
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const projects = await projectDb.getUserProjects(req.user.id);
    res.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

// Get specific project with notes
app.get('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    console.log('Getting project details for ID:', req.params.id, 'User:', req.user.id);
    
    const project = await projectDb.getProjectById(req.params.id, req.user.id);
    
    if (!project) {
      console.log('Project not found');
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log('Project found:', project);

    // Get notes for this project
    const notes = await noteDb.getProjectNotes(req.params.id);
    console.log('Notes found:', notes.length, 'notes');
    console.log('Notes details:', notes.map(n => ({ 
      id: n.id, 
      type: n.type, 
      content: n.content?.substring(0, 50),
      transcription: n.transcription?.substring(0, 50),
      hasFiles: n.files && n.files.length > 0,
      fileUrl: n.files && n.files.length > 0 ? n.files[0].file_url : null
    })));
    
    project.notes = notes;

    console.log('Sending project with notes:', {
      projectId: project.id,
      notesCount: notes.length,
      notes: notes.map(n => ({ id: n.id, type: n.type, hasFiles: n.files && n.files.length > 0 }))
    });

    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Create text note endpoint
app.post('/api/notes', authenticateToken, async (req, res) => {
  try {
    const { projectId, type, content } = req.body;
    
    console.log('Creating text note:', { projectId, type, content, userId: req.user.id });
    
    if (!projectId || !type || !content) {
      return res.status(400).json({ error: 'Project ID, type, and content are required' });
    }

    // Verify project belongs to user
    const project = await projectDb.getProjectById(projectId, req.user.id);
    if (!project) {
      console.log('Project not found for user');
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log('Project verified, creating note...');
    
    // Create note in database
    const note = await noteDb.createNote(
      projectId,
      type,
      content,
      null // no transcription for text notes
    );

    console.log('Text note created successfully:', note);
    res.status(201).json(note);

  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ 
      error: 'Failed to create note',
      details: error.message 
    });
  }
});

// Update note label endpoint
app.put('/api/notes/:id/label', authenticateToken, async (req, res) => {
  try {
    const { label } = req.body;
    const noteId = req.params.id;
    
    console.log('Updating note label:', { noteId, label, userId: req.user.id });
    
    if (!noteId) {
      return res.status(400).json({ error: 'Note ID is required' });
    }

    // Update note label in database
    const updatedNote = await noteDb.updateNoteLabel(noteId, req.user.id, label);
    
    if (!updatedNote) {
      console.log('Note not found for user');
      return res.status(404).json({ error: 'Note not found' });
    }

    console.log('Note label updated successfully:', updatedNote);
    res.json(updatedNote);

  } catch (error) {
    console.error('Update note label error:', error);
    res.status(500).json({ 
      error: 'Failed to update note label',
      details: error.message 
    });
  }
});

// Delete project
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const deletedProject = await projectDb.deleteProject(req.params.id, req.user.id);
    
    if (!deletedProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Serve static files from the built frontend in production
if (NODE_ENV === 'production') {
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));
  
  // Serve uploaded files with proper error handling
  app.use('/uploads', express.static(join(__dirname, 'uploads'), {
    fallthrough: false,
    maxAge: '1d'
  }));
  
  // Handle client-side routing - serve index.html for all non-API routes
  app.use((req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    res.sendFile(join(distPath, 'index.html'));
  });
} else {
  // Serve uploaded files in development with proper error handling
  app.use('/uploads', express.static(join(__dirname, 'uploads'), {
    fallthrough: false,
    maxAge: '1d',
    setHeaders: (res, path) => {
      // Set proper MIME types for video files
      if (path.endsWith('.webm')) {
        res.setHeader('Content-Type', 'video/webm');
      } else if (path.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
      }
      // Enable range requests for video streaming
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }));
}

// Add explicit uploads route with debugging
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = join(__dirname, 'uploads', filename);
  
  console.log('File request:', filename);
  console.log('File path:', filePath);
  
  // Set proper headers for video files
  if (filename.endsWith('.webm')) {
    res.setHeader('Content-Type', 'video/webm');
  } else if (filename.endsWith('.mp4')) {
    res.setHeader('Content-Type', 'video/mp4');
  }
  res.setHeader('Accept-Ranges', 'bytes');
  
  // Check if file exists
  fs.access(filePath)
    .then(() => {
      console.log('File exists, serving:', filename);
      res.sendFile(filePath);
    })
    .catch(() => {
      console.log('File not found:', filename);
      res.status(404).json({ error: 'File not found' });
    });
});

// Create uploads directory if it doesn't exist
try {
  await fs.access(uploadsDir);
} catch {
  await fs.mkdir(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/', 'video/', 'image/'];
    const isAllowed = allowedTypes.some(type => file.mimetype.startsWith(type));
    cb(null, isAllowed);
  }
});

// Store chat history in memory (in production, use a database)
const chatHistory = new Map();

// Upload and transcribe endpoint
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    console.log('=== UPLOAD START ===');
    const { projectId, noteType } = req.body;
    const file = req.file;
    const userId = req.user.id;

    if (!file || !projectId || !noteType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify project ownership
    const project = await projectDb.getProjectById(projectId, userId);
    if (!project) {
      console.log('Project not found for upload');
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    console.log('Processing file upload...');
    // File storage
    let fileUrl;
    let fullFilePath;

    if (s3 && process.env.AWS_S3_BUCKET) {
      // Upload to S3
      const fileName = `${uuidv4()}-${file.originalname}`;
      const uploadParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `uploads/${fileName}`,
        Body: file.buffer,
        ContentType: file.mimetype
      };

      const uploadResult = await s3.upload(uploadParams).promise();
      fileUrl = uploadResult.Location;
    } else {
      // Use local storage
      const fileName = `${uuidv4()}-${file.originalname}`;
      fullFilePath = path.join(uploadsDir, fileName);
      
      await fs.writeFile(fullFilePath, file.buffer);
      
      fileUrl = `/uploads/${fileName}`;
      
      // Verify file exists
      try {
        await fs.access(fullFilePath);
        console.log('File saved successfully');
      } catch (error) {
        console.error('File save verification failed:', error);
        throw new Error('File save verification failed');
      }
    }

    // Process file based on type
    let transcription = null;
    let imageLabel = null;

    if (noteType === 'photo') {
      try {
        // Read the image file
        const imageBuffer = await fs.readFile(fullFilePath);
        const base64Image = imageBuffer.toString('base64');
        const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Beskriv vad som syns i denna bild med 1-4 ord på svenska. Fokusera på det huvudsakliga objektet eller systemet som visas i en facilitetsinspektionskontext. Exempel: "värmepump", "elcentral", "ventilationskanal", "rörledning", "brandvarnare", "köksutrustning", "dryckesautomat". Svara endast med beskrivningen, inga extra ord eller meningar.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'low'
                }
              }
            ]
          }],
          max_tokens: 20,
          temperature: 0.3
        });

        imageLabel = response.choices[0].message.content?.trim() || '';
        
        // Clean up the label
        imageLabel = imageLabel.toLowerCase();
        console.log('Image recognition completed');
      } catch (error) {
        console.error('Image recognition failed:', error);
        imageLabel = 'Foto taget';
      }
    }

    // Save note to database
    const note = await noteDb.createNote(
      projectId,
      noteType,
      noteType === 'photo' ? (imageLabel || 'Foto taget') : 'Videoinspelning',
      transcription,
      imageLabel
    );

    // Add file info to note
    await noteDb.addFileToNote(
      note.id,
      fileUrl,
      file.mimetype,
      file.originalname,
      file.size
    );

    console.log('Upload completed successfully');
    res.json({
      success: true,
      noteId: note.id,
      fileUrl,
      transcription,
      imageLabel,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    });

    const { message, projects } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!projects || projects.length === 0) {
      return res.json({
        response: 'Det finns inga sparade projekt eller anteckningar ännu som jag kan använda för att svara på din fråga.',
        chatHistory: []
      });
    }

    // Prepare context from all projects
    let context = `Du är en AI-assistent som hjälper med analys av inspektionsprojekt. Här är användarens projekt och anteckningar:\n\n`;
    
    projects.forEach((project, index) => {
      context += `Projekt ${index + 1}: ${project.name}\n`;
      context += `Plats: ${project.location || 'Ej angiven'}\n`;
      context += `Datum: ${new Date(project.created_at).toLocaleDateString('sv-SE')}\n`;
      
      if (project.notes && project.notes.length > 0) {
        context += `Anteckningar:\n`;
        project.notes.forEach((note, noteIndex) => {
          const noteContent = note.transcription || note.content || note.image_label || 'Ingen text';
          context += `  ${noteIndex + 1}. [${note.type}] ${noteContent}\n`;
        });
      } else {
        context += `Inga anteckningar ännu.\n`;
      }
      
      if (project.ai_summary) {
        context += `AI-Sammanfattning: ${project.ai_summary}\n`;
      }
      
      context += `\n`;
    });

    // Send to OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: context + "\nSvara på svenska och var specifik när du refererar till projekt och anteckningar. Om användaren frågar om specifika projekt, sök igenom all tillgänglig data och ge detaljerade svar baserat på inspektionsanteckningarna."
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const response = completion.choices[0].message.content;

    res.json({
      response,
      chatHistory: []
    });

  } catch (error) {
    console.error('Chat request failed:', error);
    res.status(500).json({ 
      error: 'Chat request failed', 
      details: error.message 
    });
  }
});

// Generate individual item report endpoint
app.post('/api/notes/:id/generate-report', authenticateToken, async (req, res) => {
  try {
    const noteId = req.params.id;

    if (!noteId) {
      return res.status(400).json({ error: 'Note ID is required' });
    }

    // Get the specific note with project info
    const note = await noteDb.getNoteById(noteId, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Get project info for context
    const project = await projectDb.getProjectById(note.project_id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Prepare content for AI analysis
    const noteContent = note.transcription || note.content || note.image_label || 'Ingen textinformation tillgänglig';
    const noteType = note.type === 'photo' ? 'Foto' : note.type === 'video' ? 'Video' : 'Textanteckning';
    
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Du är en expert på facilitetsinspektioner. Skapa en detaljerad rapport för en enskild inspektionspost på svenska. 

Rapporten ska innehålla:
- Beskrivning av vad som observerats
- Identifierade problem eller avvikelser (om några)
- Rekommenderade åtgärder
- Prioritetsnivå (hög/medium/låg)
- Uppskattad tidsram för åtgärd

Håll rapporten fokuserad på denna specifika post och gör den professionell och actionable.`
        },
        {
          role: 'user',
          content: `Skapa en rapport för denna inspektionspost:

Projekt: ${project.name}
Plats: ${project.location || 'Ej angiven'}
Typ av post: ${noteType}
Datum: ${new Date(note.created_at).toLocaleDateString('sv-SE')}

Innehåll: ${noteContent}`
        }
      ],
      max_tokens: 600,
      temperature: 0.3
    });

    const individualReport = completion.choices[0].message.content;

    // Save the individual report to the note
    await noteDb.updateNoteSubmissionStatus(noteId, req.user.id, false, individualReport);

    res.json({ report: individualReport });

  } catch (error) {
    console.error('Individual report generation failed:', error);
    res.status(500).json({ 
      error: 'Individual report generation failed',
      details: error.message 
    });
  }
});

// Submit individual item report endpoint
app.post('/api/notes/:id/submit', authenticateToken, async (req, res) => {
  try {
    const { to, subject, customMessage } = req.body;
    const noteId = req.params.id;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Email address and subject are required' });
    }

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ error: 'SendGrid API key not configured' });
    }

    // Get the note with its individual report
    const note = await noteDb.getNoteById(noteId, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (!note.individual_report) {
      return res.status(400).json({ error: 'No report generated for this item. Please generate a report first.' });
    }

    // Get project info for context
    const project = await projectDb.getProjectById(note.project_id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const emailContent = `
${customMessage || 'Se bifogad rapport för enskild inspektionspost.'}

---

${note.individual_report}

---

Denna rapport genererades automatiskt av Inspektionsassistenten för projekt: ${project.name}
Plats: ${project.location || 'Ej angiven'}
Datum: ${new Date(note.created_at).toLocaleDateString('sv-SE')}
    `.trim();

    const msg = {
      to,
      from: process.env.FROM_EMAIL || 'noreply@inspektionsassistent.se',
      subject,
      text: emailContent,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">Inspektionsrapport - Enskild post</h2>
          ${customMessage ? `<p>${customMessage.replace(/\n/g, '<br>')}</p><hr>` : ''}
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            ${note.individual_report.replace(/\n/g, '<br>')}
          </div>
          <hr>
          <p style="color: #666; font-size: 12px;">
            Denna rapport genererades automatiskt av Inspektionsassistenten<br>
            Projekt: ${project.name}<br>
            Plats: ${project.location || 'Ej angiven'}<br>
            Datum: ${new Date(note.created_at).toLocaleDateString('sv-SE')}
          </p>
        </div>
      `
    };

    await sgMail.send(msg);
    
    // Mark the note as submitted
    await noteDb.updateNoteSubmissionStatus(noteId, req.user.id, true, note.individual_report);
    
    res.json({ success: true, message: 'Individual report sent successfully' });

  } catch (error) {
    console.error('Individual item submission failed:', error);
    res.status(500).json({ 
      error: 'Failed to send individual report',
      details: error.message 
    });
  }
});

// Summarize notes endpoint
app.post('/api/summarize', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Get project with notes
    const project = await projectDb.getProjectById(projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get all notes for the project
    const notes = await noteDb.getProjectNotes(projectId);

    if (notes.length === 0) {
      return res.status(400).json({ error: 'No notes found for this project' });
    }

    // Prepare notes text for summarization
    const notesText = notes.map(note => {
      if (note.transcription) {
        return `[${note.type}] ${note.transcription}`;
      } else if (note.content) {
        return `[${note.type}] ${note.content}`;
      } else if (note.image_label) {
        return `[${note.type}] ${note.image_label}`;
      } else {
        return `[${note.type}] Ingen textinformation`;
      }
    }).join('\n');

    // Generate summary using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Du är en expert på facilitetsinspektioner. Skapa en strukturerad sammanfattning av inspektionsanteckningarna på svenska. Inkludera identifierade problem, rekommendationer och övergripande status."
        },
        {
          role: "user",
          content: `Sammanfatta följande inspektionsanteckningar för projekt "${project.name}" på plats "${project.location || 'okänd plats'}":\n\n${notesText}`
        }
      ],
      max_tokens: 800,
      temperature: 0.3
    });

    const summary = completion.choices[0].message.content;

    // Save summary to database
    await summaryDb.upsertSummary(projectId, summary);

    res.json({
      summary
    });

  } catch (error) {
    console.error('Summarization failed:', error);
    res.status(500).json({ 
      error: 'Summarization failed', 
      details: error.message 
    });
  }
});
// Email endpoint
app.post('/api/send-email', authenticateToken, async (req, res) => {
  try {
    const { to, subject, text, pdfBuffer, fileName, projectId } = req.body;

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ error: 'SendGrid API key not configured' });
    }

    if (!to || !subject || !pdfBuffer) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, and pdfBuffer are required' });
    }

    // Verify project belongs to user (if projectId is provided)
    if (projectId) {
      const project = await projectDb.getProjectById(projectId, req.user.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
    }

    const msg = {
      to,
      from: process.env.FROM_EMAIL || 'noreply@inspektionsassistent.se',
      subject,
      text: text || 'Se bifogad inspektionsrapport.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">Inspektionsrapport</h2>
          <p>Hej,</p>
          <p>Bifogat finner du inspektionsrapporten som begärts.</p>
          <p>Rapporten har genererats automatiskt av Inspektionsassistenten.</p>
          <br>
          <p>Med vänliga hälsningar,<br>Inspektionsassistenten</p>
        </div>
      `,
      attachments: [
        {
          content: pdfBuffer,
          filename: fileName || 'inspektionsrapport.pdf',
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    await sgMail.send(msg);
    res.json({ success: true, message: 'Email sent successfully' });

  } catch (error) {
    console.error('Email sending failed:', error);
    res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message 
    });
  }
});

// Send email with attachment
app.post('/api/send-email-attachment', authenticateToken, async (req, res) => {
  try {
    const { to, subject, message, attachment, noteId } = req.body;

    if (!to || !subject || !attachment) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Prepare email
    const msg = {
      to,
      from: process.env.FROM_EMAIL || 'noreply@inspektionsassistent.se',
      subject,
      text: message || 'Se bifogad fil från inspektionsassistenten.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">Inspektionsrapport</h2>
          <p>Hej,</p>
          <p>${message ? message.replace(/\n/g, '<br>') : 'Bifogat finner du filen från inspektionen.'}</p>
          <p>Rapporten har genererats automatiskt av Inspektionsassistenten.</p>
          <br>
          <p>Med vänliga hälsningar,<br>Inspektionsassistenten</p>
        </div>
      `,
      attachments: [
        {
          content: attachment.content,
          filename: attachment.filename,
          type: attachment.type,
          disposition: 'attachment'
        }
      ],
    };

    // Send email
    await sgMail.send(msg);

    // Update note submitted status if noteId provided
    if (noteId) {
      try {
        await noteDb.updateNoteSubmissionStatus(noteId, req.user.id, true);
        console.log('Note submitted status updated:', noteId);
      } catch (error) {
        console.error('Failed to update note status:', error);
      }
    }

    res.json({
      success: true,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Email with attachment failed:', error);
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: error.message 
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    openai: !!process.env.OPENAI_API_KEY,
    sendgrid: !!process.env.SENDGRID_API_KEY,
    database: !!process.env.DATABASE_URL,
    s3: !!s3,
    environment: NODE_ENV
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});