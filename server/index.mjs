console.log("### Running deployed server/index.mjs VERSION 999 ###");
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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

// Define NODE_ENV after loading environment
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log("### ENV VARS ###", process.env);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fix uploads directory path for production
const uploadsDir = NODE_ENV === 'production' 
  ? join(process.cwd(), 'server', 'uploads')  // /app/server/uploads in production
  : join(__dirname, 'uploads');               // ./server/uploads in development

console.log('Environment:', NODE_ENV);
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);
console.log('Uploads directory:', uploadsDir);

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
  console.log('Uploads directory exists');
} catch {
  await fs.mkdir(uploadsDir, { recursive: true });
  console.log('Created uploads directory');
}

// List existing files in uploads directory
try {
  const files = await fs.readdir(uploadsDir);
  console.log('Existing files in uploads:', files.length, 'files');
  if (files.length > 0) {
    console.log('Sample files:', files.slice(0, 5));
  }
} catch (error) {
  console.log('Error reading uploads directory:', error);
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
    console.log('Upload endpoint hit');
    console.log('User:', req.user?.id);
    console.log('File:', req.file ? 'Present' : 'Missing');
    console.log('Body:', req.body);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { projectId, noteType, content } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    console.log('Verifying project ownership...');
    // Verify project belongs to user
    const project = await projectDb.getProjectById(projectId, req.user.id);
    if (!project) {
      console.log('Project not found for user');
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log('Project verified, processing file...');
    let fileUrl = null;
    let transcription = null;

    // Upload to S3 if configured, otherwise use local storage
    if (s3 && process.env.AWS_S3_BUCKET) {
      try {
        console.log('Uploading to S3...');
        const fileContent = await fs.readFile(req.file.path);
        const uploadParams = {
          Bucket: process.env.AWS_S3_BUCKET,
          Key: `uploads/${req.file.filename}`,
          Body: fileContent,
          ContentType: req.file.mimetype
        };

        const uploadResult = await s3.upload(uploadParams).promise();
        fileUrl = uploadResult.Location;
        console.log('S3 upload successful:', fileUrl);

        // Clean up local file
        await fs.unlink(req.file.path);
      } catch (s3Error) {
        console.error('S3 upload failed, using local storage:', s3Error);
        fileUrl = `/uploads/${req.file.filename}`;
      }
    } else {
      console.log('Using local storage');
      fileUrl = `/uploads/${req.file.filename}`;
      console.log('File saved to:', req.file.path);
      console.log('File URL will be:', fileUrl);
      
      // Verify file exists
      try {
        await fs.access(req.file.path);
        console.log('File verified to exist at:', req.file.path);
      } catch (error) {
        console.error('File does not exist after upload:', error);
      }
    }

    // Transcribe audio/video files
    if (req.file.mimetype.startsWith('audio/') || req.file.mimetype.startsWith('video/')) {
      try {
        console.log('Starting transcription...');
        console.log('=== WHISPER TRANSCRIPTION DEBUG ===');
        console.log('Original file details:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          filename: req.file.filename,
          path: req.file.path
        });
        
        // Check if file exists and get stats
        try {
          const fileStats = await fs.stat(req.file.path);
          console.log('File stats:', {
            size: fileStats.size,
            isFile: fileStats.isFile(),
            created: fileStats.birthtime,
            modified: fileStats.mtime
          });
        } catch (statError) {
          console.error('Error getting file stats:', statError);
        }
        
        const filePath = s3 ? null : req.file.path;
        let audioBuffer;

        if (s3 && fileUrl.startsWith('http')) {
          console.log('Using S3 file for transcription:', fileUrl);
          // Download from S3 for transcription
          const response = await fetch(fileUrl);
          audioBuffer = await response.arrayBuffer();
          console.log('Downloaded from S3, buffer size:', audioBuffer.byteLength);
        } else {
          console.log('Using local file for transcription:', filePath);
          audioBuffer = await fs.readFile(filePath);
          console.log('Read local file, buffer size:', audioBuffer.byteLength);
        }

        // Create a temporary file for OpenAI API
        const fileExtension = req.file.mimetype.split('/')[1];
        const tempFileName = `${uuidv4()}.${fileExtension}`;
        const tempFile = join(__dirname, 'temp', tempFileName);
        
        console.log('Creating temp file:', {
          originalMimetype: req.file.mimetype,
          extractedExtension: fileExtension,
          tempFileName: tempFileName,
          tempFilePath: tempFile
        });
        
        await fs.mkdir(join(__dirname, 'temp'), { recursive: true });
        await fs.writeFile(tempFile, Buffer.from(audioBuffer));
        
        // Verify temp file was created correctly
        try {
          const tempStats = await fs.stat(tempFile);
          console.log('Temp file created successfully:', {
            size: tempStats.size,
            exists: tempStats.isFile(),
            sizeMatches: tempStats.size === audioBuffer.byteLength
          });
        } catch (tempStatError) {
          console.error('Error verifying temp file:', tempStatError);
          throw new Error('Failed to create temp file for transcription');
        }

        console.log('Calling OpenAI transcription...');
        console.log('Whisper API call parameters:', {
          model: 'whisper-1',
          language: 'sv',
          fileSize: audioBuffer.byteLength,
          filePath: tempFile
        });
        
        const transcriptionStartTime = Date.now();
        const transcriptionResponse = await openai.audio.transcriptions.create({
          file: createReadStream(tempFile),
          model: 'whisper-1',
          language: 'sv'
        });
        
        const transcriptionEndTime = Date.now();
        const transcriptionDuration = transcriptionEndTime - transcriptionStartTime;

        // Filter out placeholder text and empty/meaningless transcriptions
        const rawTranscription = transcriptionResponse.text?.trim() || '';
        
        // Common placeholder texts to filter out
        const placeholderTexts = [
          'svensktextning.nu',
          'svenska textning', 
          'svensk textning',
          'textning.nu',
          'undertextning',
          'svensk undertextning',
          'undertexter från amara.org-gemenskapen',
          'amara.org',
          'undertexter från',
          'gemenskapen',
          'textning av',
          'översättning av'
        ];
        
        // Check if transcription is just placeholder text or too short to be meaningful
        const isPlaceholder = placeholderTexts.some(placeholder => 
          rawTranscription.toLowerCase().includes(placeholder.toLowerCase())
        );
        
        const isTooShort = rawTranscription.length < 3;
        const isOnlyPunctuation = /^[.,!?;:\s]*$/.test(rawTranscription);
        const isOnlyNumbers = /^[\d\s.,]*$/.test(rawTranscription);
        
        // Set transcription to empty if it's placeholder text or meaningless
        if (isPlaceholder || isTooShort || isOnlyPunctuation || isOnlyNumbers) {
          transcription = null; // No transcription text
          console.log('Filtered out placeholder/empty transcription. Raw text was:', rawTranscription);
        } else {
          transcription = rawTranscription;
        }
        
        console.log('Transcription successful:', {
          duration: `${transcriptionDuration}ms`,
          textLength: transcription ? transcription.length : 0,
          textPreview: transcription ? transcription.substring(0, 100) + (transcription.length > 100 ? '...' : '') : 'No transcription (filtered out)',
          wasFiltered: !transcription && rawTranscription.length > 0
        });

        // Clean up temp file
        try {
          await fs.unlink(tempFile);
          console.log('Temp file cleaned up successfully');
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
        
        console.log('=== END WHISPER TRANSCRIPTION DEBUG ===');
      } catch (transcriptionError) {
        console.error('=== WHISPER TRANSCRIPTION ERROR ===');
        console.error('Error type:', transcriptionError.constructor.name);
        console.error('Error message:', transcriptionError.message);
        console.error('Error code:', transcriptionError.code);
        console.error('Full error:', transcriptionError);
        
        // Check if it's an OpenAI API specific error
        if (transcriptionError.response) {
          console.error('OpenAI API response error:', {
            status: transcriptionError.response.status,
            statusText: transcriptionError.response.statusText,
            data: transcriptionError.response.data
          });
        }
        
        // Check if temp file still exists for debugging
        const tempFile = join(__dirname, 'temp', `${uuidv4()}.${req.file.mimetype.split('/')[1]}`);
        try {
          await fs.access(tempFile);
          console.log('Temp file still exists after error');
        } catch {
          console.log('Temp file does not exist after error');
        }
        
        console.error('=== END WHISPER TRANSCRIPTION ERROR ===');
        transcription = 'Transkribering misslyckades';
      }
    }

    // Generate image labels for photos using OpenAI Vision API
    let imageLabel = null;
    if (req.file.mimetype.startsWith('image/')) {
      try {
        console.log('Starting image recognition...');
        console.log('=== IMAGE RECOGNITION DEBUG ===');
        
        let imageBuffer;
        let imageUrl;

        if (s3 && fileUrl.startsWith('http')) {
          console.log('Using S3 image for recognition:', fileUrl);
          imageUrl = fileUrl;
        } else {
          console.log('Using local image for recognition:', req.file.path);
          imageBuffer = await fs.readFile(req.file.path);
          const base64Image = imageBuffer.toString('base64');
          imageUrl = `data:${req.file.mimetype};base64,${base64Image}`;
        }

        console.log('Calling OpenAI Vision API...');
        const visionStartTime = Date.now();
        
        const visionResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
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
            }
          ],
          max_tokens: 20,
          temperature: 0.3
        });

        const visionEndTime = Date.now();
        const visionDuration = visionEndTime - visionStartTime;

        const rawLabel = visionResponse.choices[0].message.content?.trim() || '';
        
        // Clean up the label - remove quotes, extra punctuation, etc.
        imageLabel = rawLabel
          .replace(/^["']|["']$/g, '') // Remove surrounding quotes
          .replace(/\.$/, '') // Remove trailing period
          .replace(/^(det är |detta är |jag ser )/i, '') // Remove common prefixes
          .toLowerCase()
          .trim();

        // Validate label length and content
        if (imageLabel.length > 30 || imageLabel.length < 2) {
          console.log('Label too long or too short, discarding:', imageLabel);
          imageLabel = null;
        }

        console.log('Image recognition successful:', {
          duration: `${visionDuration}ms`,
          rawLabel,
          cleanedLabel: imageLabel
        });
        
        console.log('=== END IMAGE RECOGNITION DEBUG ===');
      } catch (visionError) {
        console.error('=== IMAGE RECOGNITION ERROR ===');
        console.error('Error type:', visionError.constructor.name);
        console.error('Error message:', visionError.message);
        console.error('Full error:', visionError);
        
        if (visionError.response) {
          console.error('OpenAI Vision API response error:', {
            status: visionError.response.status,
            statusText: visionError.response.statusText,
            data: visionError.response.data
          });
        }
        
        console.error('=== END IMAGE RECOGNITION ERROR ===');
        imageLabel = null; // Don't fail the upload if vision fails
      }
    }
    console.log('Saving note to database...');
    // Save note to database
    const note = await noteDb.createNote(
      projectId,
      noteType,
      content || (noteType === 'photo' ? (imageLabel || 'Foto taget') : 'Videoinspelning'),
      transcription,
      imageLabel
    );

    // Add file info to note if there's a file
    if (fileUrl) {
      await noteDb.addFileToNote(
        note.id,
        fileUrl,
        req.file.mimetype,
        req.file.originalname,
        req.file.size
      );
    }

    console.log('Upload completed successfully');
    res.json({
      success: true,
      noteId: note.id,
      fileUrl,
      transcription,
      imageLabel,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Chat endpoint
app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('=== CHAT ENDPOINT HIT ===');
    console.log('User ID:', req.user.id);
    console.log('Message:', message);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Projects in request:', req.body.projects ? req.body.projects.length : 'undefined');

    // Get user's projects from database
    const projects = await projectDb.getUserProjects(req.user.id);
    console.log('=== DATABASE PROJECTS ===');
    console.log('Projects from DB:', projects.length, 'projects found');
    console.log('DB Projects:', projects.map(p => ({
      id: p.id,
      name: p.name,
      location: p.location,
      note_count: p.note_count
    })));
    
    // Get detailed project data with notes
    console.log('=== FETCHING NOTES FOR EACH PROJECT ===');
    const projectsWithNotes = await Promise.all(
      projects.map(async (project) => {
        console.log(`Fetching notes for project: ${project.name} (${project.id})`);
        const notes = await noteDb.getProjectNotes(project.id);
        console.log(`Project ${project.name}: ${notes.length} notes found`);
        console.log('Notes preview:', notes.slice(0, 2).map(n => ({
          id: n.id,
          type: n.type,
          content: n.content?.substring(0, 50),
          transcription: n.transcription?.substring(0, 50),
          image_label: n.image_label
        })));
        return { ...project, notes };
      })
    );

    console.log('=== FINAL PROJECT DATA ===');
    console.log('Projects with notes count:', projectsWithNotes.length);
    console.log('Total notes across all projects:', projectsWithNotes.reduce((sum, p) => sum + p.notes.length, 0));

    // Get or create chat history for user
    const userId = req.user.id;
    if (!chatHistory.has(userId)) {
      chatHistory.set(userId, []);
    }
    const userChatHistory = chatHistory.get(userId);

    // Prepare context from all projects
    console.log('=== PREPARING CONTEXT ===');
    const projectContext = projectsWithNotes.map(project => {
      const notesText = project.notes.map(note => 
        `[${note.type}] ${note.transcription || note.content || note.image_label || 'Ingen text'}`
      ).join('\n');
      
      const contextBlock = `Projekt: ${project.name}
Plats: ${project.location || 'Ej angiven'}
Datum: ${new Date(project.created_at).toLocaleDateString('sv-SE')}
Anteckningar:
${notesText}
${project.ai_summary ? `\nAI-Sammanfattning: ${project.ai_summary}` : ''}`;
      
      console.log(`Context for ${project.name}:`, contextBlock.substring(0, 200) + '...');
      return contextBlock;
    }).join('\n\n---\n\n');

    console.log('=== FINAL CONTEXT ===');
    console.log('Total context length:', projectContext.length);
    console.log('Project context preview:', projectContext.substring(0, 500) + '...');

    if (projectContext.trim().length === 0) {
      console.log('❌ WARNING: Empty project context!');
      console.log('Projects count:', projectsWithNotes.length);
      console.log('Projects with notes:', projectsWithNotes.filter(p => p.notes.length > 0).length);
      return res.json({
        response: `Det finns inga sparade projekt eller anteckningar ännu som jag kan använda för att svara på din fråga. Debug: ${projectsWithNotes.length} projekt hittade, ${projectsWithNotes.reduce((sum, p) => sum + p.notes.length, 0)} anteckningar totalt.`,
        chatHistory: userChatHistory
      });
    }

    // Build messages for OpenAI
    console.log('=== CALLING OPENAI ===');
    const messages = [
      {
        role: 'system',
        content: `Du är en AI-assistent som hjälper med facilitetsinspektioner. Du har tillgång till följande projektdata:

${projectContext}

Svara på svenska och var specifik när du refererar till projekt och anteckningar. Om användaren frågar om specifika projekt, sök igenom all tillgänglig data och ge detaljerade svar baserat på inspektionsanteckningarna.`
      },
      ...userChatHistory,
      { role: 'user', content: message }
    ];

    console.log('Sending to OpenAI...');
    console.log('Messages count:', messages.length);
    console.log('System message length:', messages[0].content.length);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      max_tokens: 1000,
      temperature: 0.7
    });

    const assistantResponse = completion.choices[0].message.content;
    console.log('✅ OpenAI response received, length:', assistantResponse.length);

    console.log('=== CHAT SUCCESS ===');

    // Update chat history
    userChatHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: assistantResponse }
    );

    // Keep only last 20 messages to prevent context overflow
    if (userChatHistory.length > 20) {
      userChatHistory.splice(0, userChatHistory.length - 20);
    }

    res.json({
      response: assistantResponse,
      chatHistory: userChatHistory
    });

  } catch (error) {
    console.error('=== CHAT ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    console.error('=== END CHAT ERROR ===');
    res.status(500).json({ 
      error: 'Chat request failed',
      details: error.message 
    });
  }
});

// Generate individual item report endpoint
app.post('/api/notes/:id/generate-report', authenticateToken, async (req, res) => {
  try {
    console.log('=== INDIVIDUAL REPORT GENERATION ===');
    console.log('User ID:', req.user.id);
    console.log('Note ID:', req.params.id);
    
    const noteId = req.params.id;

    if (!noteId) {
      console.log('Missing note ID in request');
      return res.status(400).json({ error: 'Note ID is required' });
    }

    console.log('Getting note details...');
    // Get the specific note with project info
    const note = await noteDb.getNoteById(noteId, req.user.id);
    if (!note) {
      console.log('Note not found for user');
      return res.status(404).json({ error: 'Note not found' });
    }

    console.log('Note found:', {
      id: note.id,
      type: note.type,
      hasContent: !!note.content,
      hasTranscription: !!note.transcription,
      hasImageLabel: !!note.image_label
    });

    // Get project info for context
    const project = await projectDb.getProjectById(note.project_id, req.user.id);
    if (!project) {
      console.log('Project not found for note');
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log('Project found:', project.name);

    // Prepare content for AI analysis
    const noteContent = note.transcription || note.content || note.image_label || 'Ingen textinformation tillgänglig';
    const noteType = note.type === 'photo' ? 'Foto' : note.type === 'video' ? 'Video' : 'Textanteckning';
    
    if (!process.env.OPENAI_API_KEY) {
      console.log('OpenAI API key not configured');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log('Calling OpenAI for individual item report...');
    console.log('Content preview:', noteContent.substring(0, 100));
    
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
    console.log('OpenAI response received, report length:', individualReport.length);

    console.log('Saving individual report to database...');
    // Save the individual report to the note
    await noteDb.updateNoteSubmissionStatus(noteId, req.user.id, false, individualReport);
    console.log('Individual report saved successfully');

    console.log('=== INDIVIDUAL REPORT GENERATION SUCCESS ===');
    res.json({ report: individualReport });

  } catch (error) {
    console.error('=== INDIVIDUAL REPORT GENERATION ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    if (error.response) {
      console.error('OpenAI API response error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    console.error('=== END INDIVIDUAL REPORT GENERATION ERROR ===');
    res.status(500).json({ 
      error: 'Individual report generation failed',
      details: error.message 
    });
  }
});

// Submit individual item report endpoint
app.post('/api/notes/:id/submit', authenticateToken, async (req, res) => {
  try {
    console.log('=== INDIVIDUAL ITEM SUBMISSION ===');
    console.log('User ID:', req.user.id);
    console.log('Note ID:', req.params.id);
    
    const { to, subject, customMessage } = req.body;
    const noteId = req.params.id;

    if (!to || !subject) {
      console.log('Missing required fields:', { to: !!to, subject: !!subject });
      return res.status(400).json({ error: 'Email address and subject are required' });
    }

    if (!process.env.SENDGRID_API_KEY) {
      console.log('SendGrid API key not configured');
      return res.status(500).json({ error: 'SendGrid API key not configured' });
    }

    console.log('Getting note with report...');
    // Get the note with its individual report
    const note = await noteDb.getNoteById(noteId, req.user.id);
    if (!note) {
      console.log('Note not found for user');
      return res.status(404).json({ error: 'Note not found' });
    }

    if (!note.individual_report) {
      console.log('No individual report found for note');
      return res.status(400).json({ error: 'No report generated for this item. Please generate a report first.' });
    }

    // Get project info for context
    const project = await projectDb.getProjectById(note.project_id, req.user.id);
    if (!project) {
      console.log('Project not found for note');
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log('Preparing email with individual report...');
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

    console.log('Sending individual report email...');
    await sgMail.send(msg);
    
    console.log('Marking item as submitted...');
    // Mark the note as submitted
    await noteDb.updateNoteSubmissionStatus(noteId, req.user.id, true, note.individual_report);
    
    console.log('Individual item submitted successfully');
    res.json({ success: true, message: 'Individual report sent successfully' });

  } catch (error) {
    console.error('=== INDIVIDUAL ITEM SUBMISSION ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    if (error.response && error.response.body) {
      console.error('SendGrid API error:', error.response.body);
    }
    
    console.error('=== END INDIVIDUAL ITEM SUBMISSION ERROR ===');
    res.status(500).json({ 
      error: 'Failed to send individual report',
      details: error.message 
    });
  }
});

// Summarize notes endpoint
app.post('/api/summarize', authenticateToken, async (req, res) => {
  try {
    console.log('=== SUMMARIZATION REQUEST ===');
    console.log('User ID:', req.user.id);
    console.log('Request body:', req.body);
    
    const { projectId } = req.body;

    if (!projectId) {
      console.log('Missing project ID in request');
      return res.status(400).json({ error: 'Project ID is required' });
    }

    console.log('Verifying project ownership for project:', projectId);
    // Verify project belongs to user
    const project = await projectDb.getProjectById(projectId, req.user.id);
    if (!project) {
      console.log('Project not found for user');
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log('Project found:', project.name);
    console.log('Getting notes for project...');
    // Get notes for this project
    const notes = await noteDb.getProjectNotes(projectId);
    console.log('Notes retrieved:', notes.length, 'notes');
    
    if (notes.length === 0) {
      console.log('No notes found for project');
      return res.status(400).json({ error: 'No notes found for this project' });
    }

    const notesText = notes.map(note => note.transcription || note.content).join('\n');
    console.log('Combined notes text length:', notesText.length);
    console.log('Notes text preview:', notesText.substring(0, 200) + '...');
    
    if (!process.env.OPENAI_API_KEY) {
      console.log('OpenAI API key not configured');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    console.log('Calling OpenAI for summarization...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Du är en expert på facilitetsinspektioner. Skapa en strukturerad sammanfattning av inspektionsanteckningarna på svenska. Inkludera identifierade problem, rekommendationer och övergripande status.'
        },
        {
          role: 'user',
          content: `Sammanfatta följande inspektionsanteckningar för projekt "${project.name}" på plats "${project.location || 'okänd plats'}":\n\n${notesText}`
        }
      ],
      max_tokens: 800,
      temperature: 0.3
    });

    const summary = completion.choices[0].message.content;
    console.log('OpenAI response received, summary length:', summary.length);

    console.log('Saving summary to database...');
    // Save summary to database
    await summaryDb.upsertSummary(projectId, summary);
    console.log('Summary saved successfully');

    console.log('=== SUMMARIZATION SUCCESS ===');
    res.json({ summary });

  } catch (error) {
    console.error('=== SUMMARIZATION ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    // Check if it's an OpenAI API specific error
    if (error.response) {
      console.error('OpenAI API response error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    console.error('=== END SUMMARIZATION ERROR ===');
    res.status(500).json({ 
      error: 'Summarization failed',
      details: error.message 
    });
  }
});
// Email endpoint
app.post('/api/send-email', authenticateToken, async (req, res) => {
  try {
    console.log('=== EMAIL ENDPOINT HIT ===');
    console.log('User ID:', req.user.id);
    console.log('Request body keys:', Object.keys(req.body));
    
    const { to, subject, text, pdfBuffer, fileName, projectId } = req.body;

    if (!process.env.SENDGRID_API_KEY) {
      console.log('SendGrid API key not configured');
      return res.status(500).json({ error: 'SendGrid API key not configured' });
    }

    if (!to || !subject || !pdfBuffer) {
      console.log('Missing required fields:', { to: !!to, subject: !!subject, pdfBuffer: !!pdfBuffer });
      return res.status(400).json({ error: 'Missing required fields: to, subject, and pdfBuffer are required' });
    }

    // Verify project belongs to user (if projectId is provided)
    if (projectId) {
      console.log('Verifying project ownership for project:', projectId);
      const project = await projectDb.getProjectById(projectId, req.user.id);
      if (!project) {
        console.log('Project not found for user');
        return res.status(404).json({ error: 'Project not found' });
      }
      console.log('Project verified:', project.name);
    }

    console.log('Preparing email message...');
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

    console.log('Sending email via SendGrid...');
    console.log('Email details:', {
      to: msg.to,
      subject: msg.subject,
      attachmentSize: pdfBuffer.length,
      fileName: fileName
    });
    
    await sgMail.send(msg);
    console.log('Email sent successfully');
    res.json({ success: true, message: 'Email sent successfully' });

  } catch (error) {
    console.error('=== EMAIL SENDING ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    
    // Check if it's a SendGrid specific error
    if (error.response && error.response.body) {
      console.error('SendGrid API error:', error.response.body);
    }
    
    console.error('=== END EMAIL ERROR ===');
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
  console.log(`OpenAI API configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`S3 configured: ${!!s3}`);
  console.log(`Database configured: ${!!process.env.DATABASE_URL}`);
  if (NODE_ENV === 'production') {
    console.log('Serving static files from dist folder');
  }
});

if (app._router && app._router.stack) {
  app._router.stack.forEach(r => {
    if (r.route && r.route.path) {
      console.log('ROUTE:', r.route.path);
    } else if (r.name === 'router' && r.handle && r.handle.stack) {
      r.handle.stack.forEach(h => {
        if (h.route && h.route.path) {
          console.log('ROUTE:', h.route.path);
        }
      });
    }
  });
}