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
import { v4 as uuidv4 } from 'uuid';
import sgMail from '@sendgrid/mail';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getObjectStream, presign, isS3Available, getBucketName } from './s3.js';

// Polyfill for OpenAI library File upload support
import { File } from 'node:buffer';
globalThis.File = File;

// Import authentication and database modules (ESM)
import { authenticateToken, registerUser, loginUser } from './auth.js';
import { organizationDb, userDb, projectDb, noteDb, summaryDb, createNoteShare, findActiveShareForNote, getShareByToken, generateSignedUrl } from './db.js';

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

// Initialize S3 client for uploads
let s3Client = null;
if (process.env.STORAGE_PROVIDER === 's3' && 
    process.env.AWS_ACCESS_KEY_ID && 
    process.env.AWS_SECRET_ACCESS_KEY && 
    process.env.S3_BUCKET) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

// Test database connection and schema on startup
const testDatabaseSchema = async () => {
  try {
    console.log('Testing database schema...');
    const result = await query('SELECT org_id FROM projects LIMIT 1');
    console.log('✅ Database schema test passed - org_id column exists');
  } catch (error) {
    console.error('❌ Database schema test failed:', error.message);
    console.error('Make sure the database has org_id columns instead of organization_id');
  }
};

// Run schema test on startup
testDatabaseSchema();

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
    const { email, password, name, organizationName, inviteToken } = req.body;

    // Basic validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    if (!organizationName && !inviteToken) {
      return res.status(400).json({ error: 'Must provide either organization name or invite token' });
    }

    const result = await registerUser(email, password, name, organizationName, inviteToken);
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

// Organization Routes (Protected)

// Get user's organizations
app.get('/api/organizations', authenticateToken, async (req, res) => {
  try {
    const organizations = await organizationDb.getUserOrganizations(req.user.id);
    res.json(organizations);
  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

// Get organization members
app.get('/api/organizations/:id/members', authenticateToken, async (req, res) => {
  try {
    const members = await organizationDb.getOrganizationMembers(req.params.id, req.user.id);
    res.json(members);
  } catch (error) {
    console.error('Get organization members error:', error);
    res.status(500).json({ error: 'Failed to get organization members' });
  }
});

// Remove user from organization
app.delete('/api/organizations/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { id: organizationId, userId } = req.params;
    
    // Check if current user is admin of this organization
    const organization = await organizationDb.getOrganizationById(organizationId, req.user.id);
    if (!organization || organization.role !== 'admin') {
      return res.status(403).json({ error: 'Only organization admins can remove users' });
    }
    
    // Prevent removing yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself from the organization' });
    }
    
    // Remove user from organization
    await organizationDb.removeUserFromOrganization(organizationId, userId);
    
    res.json({ message: 'User removed successfully' });
  } catch (error) {
    console.error('Remove user from organization error:', error);
    res.status(500).json({ error: 'Failed to remove user from organization' });
  }
});

// Create organization invite
app.post('/api/organizations/:id/invite', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    const orgId = req.params.id;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user is admin of this organization
    const organization = await organizationDb.getOrganizationById(orgId, req.user.id);
    if (!organization || organization.role !== 'admin') {
      return res.status(403).json({ error: 'Only organization admins can send invites' });
    }

    // Generate unique invite token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await organizationDb.createInvite(
      orgId,
      email,
      req.user.id,
      token,
      expiresAt
    );

    // TODO: Send email with invite link
    // For now, just return the invite token
    res.status(201).json({
      success: true,
      inviteToken: token,
      inviteUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite/${token}`
    });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// Create shareable link for note
app.post('/api/notes/:noteId/share', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { expiresAt } = req.body;
    
    // Verify note exists and user has access
    const note = await noteDb.getNoteById(noteId, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    // Check for existing active share
    let share = await findActiveShareForNote(noteId);
    
    if (!share) {
      // Create new share
      share = await createNoteShare(
        noteId, 
        req.user.id, 
        expiresAt ? new Date(expiresAt) : null
      );
    }
    
    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/share/${share.token}`;
    
    res.json({ url: shareUrl });
  } catch (error) {
    console.error('Create share error:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// Public share endpoint
app.get('/api/share/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Basic rate limiting - simple in-memory store
    const now = Date.now();
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitKey = `share_${clientIp}`;
    
    if (!global.rateLimitStore) {
      global.rateLimitStore = new Map();
    }
    
    const clientRequests = global.rateLimitStore.get(rateLimitKey) || [];
    const recentRequests = clientRequests.filter(time => now - time < 60000); // 1 minute window
    
    if (recentRequests.length >= 10) { // 10 requests per minute
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    recentRequests.push(now);
    global.rateLimitStore.set(rateLimitKey, recentRequests);
    
    // Get share data
    const share = await getShareByToken(token);
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    // Check if expired
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }
    
    // Get media URL and mime type
    const mediaUrl = share.file_url || null;
    const mimeType = share.file_type || null;
    
    // Get caption based on note type
    let caption = '';
    if (share.type === 'photo' && share.image_label) {
      caption = share.image_label;
    } else if (share.type === 'video' && share.transcription) {
      caption = share.transcription;
    } else if (share.content) {
      caption = share.content;
    }
    
    res.json({
      type: share.type,
      mediaUrl,
      caption,
      projectName: share.project_name,
      createdAt: share.note_created_at,
      mimeType
    });
    
  } catch (error) {
    console.error('Get share error:', error);
    res.status(500).json({ error: 'Failed to get share data' });
  }
});

// Get invite details
app.get('/api/invites/:token', async (req, res) => {
  try {
    const invite = await organizationDb.getInviteByToken(req.params.token);
    
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found or expired' });
    }

    res.json({
      organizationName: invite.organization_name,
      invitedBy: invite.invited_by_name,
      email: invite.email
    });
  } catch (error) {
    console.error('Get invite error:', error);
    res.status(500).json({ error: 'Failed to get invite details' });
  }
});

// Accept invite
app.post('/api/invites/:token/accept', async (req, res) => {
  try {
    const { name, password } = req.body;
    const token = req.params.token;
    
    // Validate input
    const errors = [];
    
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      errors.push({ path: 'name', message: 'Name must be at least 1 character long' });
    }
    
    if (!password || typeof password !== 'string' || password.length < 6) {
      errors.push({ path: 'password', message: 'Password must be at least 6 characters long' });
    }
    
    if (errors.length > 0) {
      console.error('Validation errors:', errors);
      return res.status(400).json({ 
        error: 'validation', 
        details: errors 
      });
    }

    // Get invite details
    const invite = await organizationDb.getInviteByToken(token);
    
    if (!invite) {
      return res.status(404).json({ 
        error: 'validation', 
        details: [{ path: 'token', message: 'Invite not found or expired' }] 
      });
    }

    if (invite.status !== 'pending') {
      return res.status(410).json({ 
        error: 'validation', 
        details: [{ path: 'token', message: 'Invite has already been used' }] 
      });
    }

    // Check if user already exists
    const existingUser = await userDb.findUserByEmail(invite.email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email' });
    }

    // Create user account and add to organization
    const result = await registerUser(invite.email, password, name, null, token);
    
    // Mark invite as accepted
    await organizationDb.updateInviteStatus(token, 'accepted');

    // Return user data and token
    const { user: userResponse, token: authToken } = result;
    res.json({ user: userResponse, token: authToken });

  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ 
      error: 'server', 
      details: [{ path: 'general', message: 'Failed to accept invite' }] 
    });
  }
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
      hasFileKey: !!n.file_key,
      fileUrl: n.file_url
    })));
    
    project.notes = notes;

    console.log('Sending project with notes:', {
      projectId: project.id,
      notesCount: notes.length,
      notes: notes.map(n => ({ id: n.id, type: n.type, hasFileKey: !!n.file_key }))
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

// Update note details (label, content, delomrade, transcription)
app.put('/api/notes/:id', authenticateToken, async (req, res) => {
  try {
    const { imageLabel, content, delomrade, transcription } = req.body;
    const noteId = req.params.id;

    console.log('Updating note details:', { noteId, imageLabel, content, delomrade, transcription, userId: req.user.id });

    if (!noteId) {
      return res.status(400).json({ error: 'Note ID is required' });
    }

    const updates = {};
    if (imageLabel !== undefined) updates.imageLabel = imageLabel;
    if (content !== undefined) updates.content = content;
    if (delomrade !== undefined) updates.delomrade = delomrade;
    if (transcription !== undefined) updates.transcription = transcription;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    // Update note in database
    const updatedNote = await noteDb.updateNoteDetails(noteId, req.user.id, updates);

    if (!updatedNote) {
      console.log('Note not found for user');
      return res.status(404).json({ error: 'Note not found' });
    }

    console.log('Note updated successfully:', updatedNote);
    res.json(updatedNote);

  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({
      error: 'Failed to update note',
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
    
    // Generate S3 object key
    const fileExtension = file.originalname.split('.').pop();
    const s3Key = `project-uploads/${uuidv4()}.${fileExtension}`;
    let fileUrl;
    let tempFilePath = file.path; // For transcription processing

    if (process.env.STORAGE_PROVIDER === 's3' && s3Client && process.env.S3_BUCKET) {
      // Upload to S3
      console.log('Uploading to S3 bucket:', process.env.S3_BUCKET);
      
      const fileBuffer = await fs.readFile(tempFilePath);
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: file.mimetype,
        ServerSideEncryption: 'AES256'
      });

      await s3Client.send(uploadCommand);
      
      // Generate signed URL for immediate access
      const signedUrlTTL = parseInt(process.env.SIGNED_URL_TTL_SECONDS) || 3600; // 1 hour default
      fileUrl = await presign(s3Key, signedUrlTTL);
      
      console.log('File uploaded to S3 successfully');
    } else {
      throw new Error('S3 storage not properly configured. Check STORAGE_PROVIDER, S3_BUCKET, and AWS credentials.');
    }

    // Process file based on type
    let transcription = null;
    let imageLabel = null;

    if (noteType === 'photo') {
      try {
        // Read the image file
        const imageBuffer = await fs.readFile(tempFilePath);
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
    } else if (noteType === 'video') {
      try {
        console.log('Starting video transcription...');
        
        // Create a readable stream from the video file for OpenAI Whisper
        const videoStream = createReadStream(tempFilePath);
        
        const response = await openai.audio.transcriptions.create({
          file: videoStream,
          model: 'whisper-1',
          language: 'sv', // Swedish
          response_format: 'text',
          temperature: 0.2
        });

        transcription = response?.trim() || '';
        console.log('Video transcription completed:', transcription.substring(0, 100));
      } catch (error) {
        console.error('Video transcription failed:', error);
        transcription = 'Videoinspelning (transkription misslyckades)';
      }
    }

    // Clean up temporary file
    try {
      await fs.unlink(tempFilePath);
    } catch (error) {
      console.warn('Failed to clean up temporary file:', error);
    }

    // Save note to database
    const note = await noteDb.createNote(
      projectId,
      noteType,
      noteType === 'photo' ? (imageLabel || 'Foto taget') : 'Videoinspelning',
      transcription,
      imageLabel,
      s3Key // Pass the S3 key to be stored in file_key column
    );

    console.log('Upload completed successfully');
    return res.json({
      success: true,
      noteId: note.id,
      mediaUrl: fileUrl,
      fileName: `${uuidv4()}.${fileExtension}`,
      mimeType: file.mimetype,
      fileSize: file.size,
      transcription,
      imageLabel
    });

  } catch (error) {
    console.error('Upload failed:', error);
    return res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

// Chat endpoint
app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
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
      context += `Skapad: ${new Date(project.createdAt || project.created_at).toLocaleDateString('sv-SE')}\n`;
      if (project.date && project.date !== project.createdAt && project.date !== project.created_at) {
        context += `Projektdatum: ${new Date(project.date).toLocaleDateString('sv-SE')}\n`;
      }
      
      if (project.notes && project.notes.length > 0) {
        context += `Anteckningar:\n`;
        project.notes.forEach((note, noteIndex) => {
          const noteContent = note.transcription || note.content || note.image_label || 'Ingen text';
          const noteDate = new Date(note.timestamp || note.created_at).toLocaleDateString('sv-SE');
          const noteTime = new Date(note.timestamp || note.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
          context += `  ${noteIndex + 1}. [${note.type}] (${noteDate} ${noteTime}) ${noteContent}\n`;
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
          content: context + "\nSvara på svenska och var specifik när du refererar till projekt och anteckningar. Om användaren frågar om specifika projekt, sök igenom all tillgänglig data och ge detaljerade svar baserat på inspektionsanteckningarna. Du har tillgång till datum för när projekt skapades och när varje anteckning gjordes."
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
app.post('/api/send-email-note', authenticateToken, async (req, res) => {
  try {
    const { to, subject, message, noteId } = req.body;
    
    if (!to || !subject || !noteId) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, noteId' });
    }
    
    // Get the note from database
    const note = await noteDb.getNoteById(noteId, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Generate share URL for the note
    let shareUrl = '';
    try {
      // Look for existing active share
      let share = await findActiveShareForNote(noteId);
      
      if (!share) {
        // Create new share (expires in 30 days)
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        share = await createNoteShare(noteId, req.user.id, expiresAt);
      }
      
      shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/share/${share.token}`;
    } catch (error) {
      console.error('Failed to create share URL:', error);
    }

    // Determine if this is a video (don't attach videos, only provide link)
    const isVideo = note.type === 'video';
    
    // Compose email message with share URL
    let emailMessage = message || '';
    if (shareUrl) {
      if (emailMessage) {
        emailMessage += '\n\n';
      }
      if (isVideo) {
        emailMessage += `Visa video: ${shareUrl}`;
      } else {
        emailMessage += `Visa bild: ${shareUrl}`;
      }
    }

    // For images, get the file from S3 and attach it
    // For videos, we only include the share link
    let attachmentContent = null;
    let attachmentInfo = null;
    
    if (!isVideo && note.file_key) {
      try {
        console.log('Getting file from S3 for attachment:', note.file_key);
        const s3Object = await getObjectStream(note.file_key);
        if (s3Object) {
          // Convert stream to buffer
          const chunks = [];
          for await (const chunk of s3Object.stream) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          attachmentContent = buffer.toString('base64');
          
          // Extract filename from file_key
          const keyParts = note.file_key.split('/');
          const fileName = keyParts[keyParts.length - 1];
          
          attachmentInfo = {
            content: attachmentContent,
            filename: fileName,
            type: s3Object.contentType,
            disposition: 'attachment'
          };
          
          console.log('Successfully retrieved file from S3 for attachment');
        } else {
          console.log('Could not retrieve file from S3');
        }
      } catch (error) {
        console.error('Failed to get file from S3:', error);
      }
    }
    
    // If no attachment could be retrieved for an image, inform user
    if (!isVideo && !attachmentContent) {
      if (note.file_key) {
        emailMessage += '\n\nObs: Kunde inte bifoga filen, men du kan visa den via länken ovan.';
      } else {
        emailMessage += '\n\nObs: Detta är en äldre anteckning utan bifogad fil.';
      }
    }
    
    // Prepare email
    const msg = {
      to,
      from: process.env.FROM_EMAIL || 'noreply@inspektionsassistent.se',
      subject,
      text: emailMessage || 'Se bifogad fil från inspektionsassistenten.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">Inspektionsrapport</h2>
          <p>Hej,</p>
          <p>${emailMessage ? emailMessage.replace(/\n/g, '<br>') : 'Bifogat finner du filen från inspektionen.'}</p>
          <p>Rapporten har genererats automatiskt av Inspektionsassistenten.</p>
          <br>
          <p>Med vänliga hälsningar,<br>Inspektionsassistenten</p>
        </div>
      `,
    };

    // Only attach files for non-video content and when we have attachment content
    if (attachmentInfo) {
      msg.attachments = [attachmentInfo];
    }

    // Send email
    await sgMail.send(msg);
    console.log('Email sent successfully');

    // Update note submitted status
    try {
      const updatedNote = await noteDb.updateNoteSubmissionStatus(noteId, req.user.id, true);
      console.log('✅ Database update successful:', updatedNote ? 'Note updated' : 'Note not found');
    } catch (dbError) {
      console.error('❌ Database update failed:', dbError);
    }

    res.json({
      success: true,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Email with note failed:', error);
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: error.message 
    });
  }
});

// Keep the old endpoint for backward compatibility
app.post('/api/send-email-attachment', authenticateToken, async (req, res) => {
  try {
    const { to, subject, message, noteId, attachment } = req.body;
    
    if (!to || !subject) {
      return res.status(400).json({ error: 'Missing required fields: to, subject' });
    }
    
    console.log('=== EMAIL WITH ATTACHMENT DEBUG ===');
    
    // Get attachment content from S3 if noteId is provided
    let attachmentContent = null;
    const isVideo = attachment?.type?.startsWith('video/') || false;
    
    if (noteId && !isVideo) {
      try {
        const note = await noteDb.getNoteById(noteId, req.user.id);
        if (note && note.file_key) {
          console.log('Getting file from S3 for attachment:', note.file_key);
          const s3Object = await getObjectStream(note.file_key);
          if (s3Object) {
            const chunks = [];
            for await (const chunk of s3Object.stream) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            attachmentContent = buffer.toString('base64');
            console.log('Successfully retrieved file from S3 for attachment');
          }
        }
      } catch (error) {
        console.error('Failed to get file from S3:', error);
      }
    }
    
    // Fallback to provided attachment content
    if (!attachmentContent && attachment?.content) {
      attachmentContent = attachment.content;
    }
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Attachment keys:', attachment ? Object.keys(attachment) : 'No attachment');
    console.log('Note ID received:', noteId);
    console.log('Note ID type:', typeof noteId);
    console.log('Note ID === null:', noteId === null);
    console.log('Note ID === undefined:', noteId === undefined);
    
    if (!attachment) {
      return res.status(400).json({ error: 'Attachment is required' });
    }
    
    const emailMessage = message || '';
    
    // Determine if this is a video (don't attach videos, only provide link)
    
    // Prepare email
    const msg = {
      to,
      from: process.env.FROM_EMAIL || 'noreply@inspektionsassistent.se',
      subject,
      text: emailMessage || 'Se bifogad fil från inspektionsassistenten.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">Inspektionsrapport</h2>
          <p>Hej,</p>
          <p>${emailMessage ? emailMessage.replace(/\n/g, '<br>') : 'Bifogat finner du filen från inspektionen.'}</p>
          <p>Rapporten har genererats automatiskt av Inspektionsassistenten.</p>
          <br>
          <p>Med vänliga hälsningar,<br>Inspektionsassistenten</p>
        </div>
      `,
    };

    // Only attach files for non-video content
    if (!isVideo && attachmentContent && attachment) {
      msg.attachments = [
        {
          content: attachmentContent,
          filename: attachment.filename,
          type: attachment.type,
          disposition: 'attachment'
        }
      ];
    }

    // Send email
    await sgMail.send(msg);
    console.log('Email sent successfully');

    // Update note submitted status only if noteId is provided
    if (noteId && typeof noteId === 'string' && !noteId.startsWith('fallback-')) {
      console.log('Updating note submitted status for noteId:', noteId);
      try {
        const updatedNote = await noteDb.updateNoteSubmissionStatus(noteId, req.user.id, true);
        console.log('✅ Database update successful:', updatedNote ? 'Note updated' : 'Note not found');
        console.log('Updated note data:', updatedNote);
      } catch (dbError) {
        console.error('❌ Database update failed:', dbError);
      }
    } else {
      console.log('Skipping database update due to missing/fallback noteId');
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

// Debug endpoint to capture frontend note data
app.post('/api/debug-note', authenticateToken, async (req, res) => {
  try {
    console.log('=== FRONTEND DEBUG DATA ===');
    console.log('Note object received from frontend:', JSON.stringify(req.body.noteObject, null, 2));
    console.log('Note ID:', req.body.noteId);
    console.log('Note ID type:', req.body.noteIdType);
    console.log('All note keys:', req.body.allNoteKeys);
    console.log('=== END FRONTEND DEBUG DATA ===');
    
    res.json({ success: true });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: 'Debug failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  console.log('Environment check:', {
    openai: !!process.env.OPENAI_API_KEY,
    sendgrid: !!process.env.SENDGRID_API_KEY,
    database: !!process.env.DATABASE_URL,
    nodeEnv: NODE_ENV
  });
  
  res.json({ 
    status: 'ok', 
    openai: !!process.env.OPENAI_API_KEY,
    sendgrid: !!process.env.SENDGRID_API_KEY,
    database: !!process.env.DATABASE_URL,
    s3: !!s3Client,
    environment: NODE_ENV
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});