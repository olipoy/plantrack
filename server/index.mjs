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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin === 'https://plantrack-production.up.railway.app') return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the built frontend in production
if (NODE_ENV === 'production') {
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));
  
  // Serve uploaded files
  app.use('/uploads', express.static(join(__dirname, 'uploads')));
  
  // Handle client-side routing - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
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
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { projectId, noteType } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    let fileUrl = null;
    let transcription = null;

    // Upload to S3 if configured, otherwise use local storage
    if (s3 && process.env.AWS_S3_BUCKET) {
      try {
        const fileContent = await fs.readFile(req.file.path);
        const uploadParams = {
          Bucket: process.env.AWS_S3_BUCKET,
          Key: `uploads/${req.file.filename}`,
          Body: fileContent,
          ContentType: req.file.mimetype
        };

        const uploadResult = await s3.upload(uploadParams).promise();
        fileUrl = uploadResult.Location;

        // Clean up local file
        await fs.unlink(req.file.path);
      } catch (s3Error) {
        console.error('S3 upload failed, using local storage:', s3Error);
        fileUrl = `/uploads/${req.file.filename}`;
      }
    } else {
      fileUrl = `/uploads/${req.file.filename}`;
    }

    // Transcribe audio/video files
    if (req.file.mimetype.startsWith('audio/') || req.file.mimetype.startsWith('video/')) {
      try {
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

        const transcriptionResponse = await openai.audio.transcriptions.create({
          file: await fs.readFile(tempFile),
          model: 'whisper-1',
          language: 'sv'
        });

        transcription = transcriptionResponse.text;

        // Clean up temp file
        await fs.unlink(tempFile);
      } catch (transcriptionError) {
        console.error('Transcription failed:', transcriptionError);
        transcription = 'Transkribering misslyckades';
      }
    }

    res.json({
      success: true,
      fileUrl,
      transcription,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, projects, userId = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get or create chat history for user
    if (!chatHistory.has(userId)) {
      chatHistory.set(userId, []);
    }
    const userChatHistory = chatHistory.get(userId);

    // Prepare context from all projects
    const projectContext = projects.map(project => {
      const notesText = project.notes.map(note => 
        `[${note.type}] ${note.transcription || note.content}`
      ).join('\n');
      
      return `Projekt: ${project.name}
Plats: ${project.location}
Datum: ${new Date(project.createdAt).toLocaleDateString('sv-SE')}
Anteckningar:
${notesText}
${project.aiSummary ? `\nAI-Sammanfattning: ${project.aiSummary}` : ''}`;
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
app.post('/api/summarize', async (req, res) => {
  try {
    const { notes, projectName, projectLocation } = req.body;

    if (!notes || notes.length === 0) {
      return res.status(400).json({ error: 'Notes are required' });
    }

    const notesText = notes.join('\n');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Du är en expert på facilitetsinspektioner. Skapa en strukturerad sammanfattning av inspektionsanteckningarna på svenska. Inkludera identifierade problem, rekommendationer och övergripande status.'
        },
        {
          role: 'user',
          content: `Sammanfatta följande inspektionsanteckningar för projekt "${projectName}" på plats "${projectLocation}":\n\n${notesText}`
        }
      ],
      max_tokens: 800,
      temperature: 0.3
    });

    const summary = completion.choices[0].message.content;

    res.json({ summary });

  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({ error: 'Summarization failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    openai: !!process.env.OPENAI_API_KEY,
    s3: !!s3,
    environment: NODE_ENV
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`OpenAI API configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`S3 configured: ${!!s3}`);
  if (NODE_ENV === 'production') {
    console.log('Serving static files from dist folder');
  }
});