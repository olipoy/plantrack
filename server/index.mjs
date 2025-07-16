console.log("### Running deployed server/index.mjs VERSION 999 ###");
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import sgMail from '@sendgrid/mail';

// Import authentication and database modules (ESM)
import { authenticateToken, registerUser, loginUser } from './auth.js';
import { projectDb, noteDb, summaryDb } from './db.js';
console.log("### ENV VARS ###", process.env);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

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
    
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await projectDb.createProject(
      req.user.id,
      name,
      description || '',
      location || '',
      inspector || '',
      projectDate ? new Date(projectDate) : new Date()
    );

    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
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
    const project = await projectDb.getProjectById(req.params.id, req.user.id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get notes for this project
    const notes = await noteDb.getProjectNotes(req.params.id);
    project.notes = notes;

    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to get project' });
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
  
  // Serve uploaded files
  app.use('/uploads', express.static(join(__dirname, 'uploads')));
  
  // Handle client-side routing - serve index.html for all non-API routes
  app.use((req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    res.sendFile(join(distPath, 'index.html'));
  });
} else {
  // Serve uploaded files in development
  app.use('/uploads', express.static(join(__dirname, 'uploads')));
}

// Create uploads directory if it doesn't exist
const uploadsDir = join(__dirname, 'uploads');
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
    }

    // Transcribe audio/video files
    if (req.file.mimetype.startsWith('audio/') || req.file.mimetype.startsWith('video/')) {
      try {
        console.log('Starting transcription...');
        const filePath = s3 ? null : req.file.path;
        let audioBuffer;

        if (s3 && fileUrl.startsWith('http')) {
          // Download from S3 for transcription
          const response = await fetch(fileUrl);
          audioBuffer = await response.arrayBuffer();
        } else {
          audioBuffer = await fs.readFile(filePath);
        }

        // Create a temporary file for OpenAI API
        const tempFile = join(__dirname, 'temp', `${uuidv4()}.${req.file.mimetype.split('/')[1]}`);
        await fs.mkdir(join(__dirname, 'temp'), { recursive: true });
        await fs.writeFile(tempFile, Buffer.from(audioBuffer));

        console.log('Calling OpenAI transcription...');
        const transcriptionResponse = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: 'whisper-1',
          language: 'sv'
        });

        transcription = transcriptionResponse.text;
        console.log('Transcription successful');

        // Clean up temp file
        await fs.unlink(tempFile);
      } catch (transcriptionError) {
        console.error('Transcription failed:', transcriptionError);
        transcription = 'Transkribering misslyckades';
      }
    }

    console.log('Saving note to database...');
    // Save note to database
    const note = await noteDb.createNote(
      projectId,
      noteType,
      content || (noteType === 'photo' ? 'Foto taget' : 'Videoinspelning'),
      transcription
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

    // Get user's projects from database
    const projects = await projectDb.getUserProjects(req.user.id);
    
    // Get detailed project data with notes
    const projectsWithNotes = await Promise.all(
      projects.map(async (project) => {
        const notes = await noteDb.getProjectNotes(project.id);
        return { ...project, notes };
      })
    );

    // Get or create chat history for user
    const userId = req.user.id;
    if (!chatHistory.has(userId)) {
      chatHistory.set(userId, []);
    }
    const userChatHistory = chatHistory.get(userId);

    // Prepare context from all projects
    const projectContext = projectsWithNotes.map(project => {
      const notesText = project.notes.map(note => 
        `[${note.type}] ${note.transcription || note.content}`
      ).join('\n');
      
      return `Projekt: ${project.name}
Plats: ${project.location || 'Ej angiven'}
Datum: ${new Date(project.created_at).toLocaleDateString('sv-SE')}
Anteckningar:
${notesText}
${project.ai_summary ? `\nAI-Sammanfattning: ${project.ai_summary}` : ''}`;
    }).join('\n\n---\n\n');

    // Build messages for OpenAI
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      max_tokens: 1000,
      temperature: 0.7
    });

    const assistantResponse = completion.choices[0].message.content;

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
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Chat request failed' });
  }
});

// Summarize notes endpoint
app.post('/api/summarize', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Verify project belongs to user
    const project = await projectDb.getProjectById(projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get notes for this project
    const notes = await noteDb.getProjectNotes(projectId);
    
    if (notes.length === 0) {
      return res.status(400).json({ error: 'No notes found for this project' });
    }

    const notesText = notes.map(note => note.transcription || note.content).join('\n');
    
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

    // Save summary to database
    await summaryDb.upsertSummary(projectId, summary);

    res.json({ summary });

  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({ error: 'Summarization failed' });
  }
});
// Email endpoint
app.post('/api/send-email', authenticateToken, async (req, res) => {
  try {
    const { to, subject, text, pdfBuffer, fileName, projectId } = req.body;

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ error: 'SendGrid API key not configured' });
    }

    if (!to || !subject || !pdfBuffer || !projectId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify project belongs to user
    const project = await projectDb.getProjectById(projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
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
    console.error('Email sending error:', error);
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