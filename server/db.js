// Database connection and query utilities
import pkg from 'pg';
const { Pool } = pkg;
import pkg from 'pg';
import { presign } from './s3.js';

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text: text.substring(0, 50) + '...', duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Organization-related database functions
const organizationDb = {
  // Create a new organization
  async createOrganization(name, adminUserId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create organization
      const orgResult = await client.query(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING *',
        [name]
      );
      const organization = orgResult.rows[0];
      
      // Add admin user to organization
      await client.query(
        'INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)',
        [organization.id, adminUserId, 'admin']
      );
      
      await client.query('COMMIT');
      return organization;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Get user's organizations
  async getUserOrganizations(userId) {
    const result = await query(
      `SELECT o.*, ou.role
       FROM organizations o
       JOIN organization_users ou ON o.id = ou.organization_id
       WHERE ou.user_id = $1
       ORDER BY o.created_at ASC`,
      [userId]
    );
    return result.rows;
  },

  // Get organization by ID (with user access check)
  async getOrganizationById(organizationId, userId) {
    const result = await query(
      `SELECT o.*, ou.role
       FROM organizations o
       JOIN organization_users ou ON o.id = ou.organization_id
       WHERE o.id = $1 AND ou.user_id = $2`,
      [organizationId, userId]
    );
    return result.rows[0];
  },

  // Get organization members
  async getOrganizationMembers(organizationId, userId) {
    // First check if user has access to this organization
    const accessCheck = await query(
      'SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2',
      [organizationId, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      throw new Error('Access denied');
    }
    
    const result = await query(
      `SELECT u.id, u.name, u.email, ou.role
       FROM users u
       JOIN organization_users ou ON u.id = ou.user_id
       WHERE ou.organization_id = $1
       ORDER BY u.created_at ASC`,
      [organizationId]
    );
    return result.rows;
  },

  // Create organization invite
  async createInvite(organizationId, email, invitedBy, token, expiresAt) {
    const result = await query(
      'INSERT INTO organization_invites (organization_id, email, invited_by, token, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [organizationId, email, invitedBy, token, expiresAt]
    );
    return result.rows[0];
  },

  // Get invite by token
  async getInviteByToken(token) {
    const result = await query(
      `SELECT oi.*, o.name as organization_name, u.name as invited_by_name
       FROM organization_invites oi
       JOIN organizations o ON oi.organization_id = o.id
       LEFT JOIN users u ON oi.invited_by = u.id
       WHERE oi.token = $1 AND (oi.expires_at IS NULL OR oi.expires_at > NOW())`,
      [token]
    );
    return result.rows[0];
  },

  // Accept invite
  async acceptInvite(token, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get invite details
      const inviteResult = await client.query(
        'SELECT * FROM organization_invites WHERE token = $1 AND (expires_at IS NULL OR expires_at > NOW())',
        [token]
      );
      
      if (inviteResult.rows.length === 0) {
        throw new Error('Invalid or expired invite');
      }
      
      const invite = inviteResult.rows[0];
      
      // Check if user is already a member
      const memberCheck = await client.query(
        'SELECT id FROM organization_users WHERE organization_id = $1 AND user_id = $2',
        [invite.organization_id, userId]
      );
      
      if (memberCheck.rows.length > 0) {
        throw new Error('User is already a member of this organization');
      }
      
      // Add user to organization
      await client.query(
        'INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)',
        [invite.organization_id, userId, 'member']
      );
      
      // Delete the invite
      await client.query('DELETE FROM organization_invites WHERE id = $1', [invite.id]);
      
      await client.query('COMMIT');
      return invite.organization_id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Update invite status
  async updateInviteStatus(token, status, acceptedBy = null) {
    const result = await query(
      'UPDATE organization_invites SET status = $1, accepted_by = $2, accepted_at = CASE WHEN $1 = \'accepted\' THEN NOW() ELSE accepted_at END WHERE token = $3 RETURNING *',
      [status, acceptedBy, token]
    );
    return result.rows[0];
  },

  // Get user's primary organization ID
  async getUserPrimaryOrganization(userId) {
    const result = await query(
      'SELECT organization_id FROM organization_users WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    return result.rows[0]?.organization_id || null;
  },

  // Get user by email (needed for invite acceptance)
  async getUserByEmail(email) {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  }
};

// User-related database functions
const userDb = {
  // Create a new user
  async createUser(email, passwordHash, name) {
    const result = await query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email, passwordHash, name]
    );
    return result.rows[0];
  },

  // Find user by email
  async findUserByEmail(email) {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  },

  // Find user by ID
  async findUserById(id) {
    const result = await query('SELECT id, email, name, created_at FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }
};

// Project-related database functions
const projectDb = {
  // Create a new project
  async createProject(userId, name, description, location, inspector, projectDate, orgId) {
    if (!orgId) {
      // Get user's primary organization
      orgId = await organizationDb.getUserPrimaryOrganization(userId);
      if (!orgId) {
        throw new Error('User must belong to an organization to create projects');
      }
    }
    
    const result = await query(
      `INSERT INTO projects (user_id, name, description, location, inspector, project_date, org_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, name, description, location, inspector, project_date, created_at, updated_at`,
      [userId, name, description, location, inspector, projectDate, orgId]
    );
    return result.rows[0];
  },

  // Get all projects for a user
  async getUserProjects(userId) {
    const orgId = await organizationDb.getUserPrimaryOrganization(userId);
    if (!orgId) {
      return [];
    }
    
    const result = await query(
      `SELECT p.*, 
       (SELECT COUNT(*) FROM notes WHERE project_id = p.id) as note_count,
       (SELECT content FROM summaries WHERE project_id = p.id ORDER BY updated_at DESC LIMIT 1) as ai_summary
       FROM projects p 
       WHERE p.org_id = $1 
       ORDER BY p.updated_at DESC`,
      [orgId]
    );
    return result.rows;
  },

  // Get a specific project (with ownership check)
  async getProjectById(projectId, userId) {
    const orgId = await organizationDb.getUserPrimaryOrganization(userId);
    if (!orgId) {
      return null;
    }
    
    const result = await query(
      `SELECT p.*,
       (SELECT content FROM summaries WHERE project_id = p.id ORDER BY updated_at DESC LIMIT 1) as ai_summary
       FROM projects p 
       WHERE p.id = $1 AND p.org_id = $2`,
      [projectId, orgId]
    );
    return result.rows[0];
  },

  // Update project
  async updateProject(projectId, userId, updates) {
    const orgId = await organizationDb.getUserPrimaryOrganization(userId);
    if (!orgId) {
      return null;
    }
    
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 3}`).join(', ');
    const values = Object.values(updates);
    
    const result = await query(
      `UPDATE projects SET ${setClause} WHERE id = $1 AND org_id = $2 RETURNING *`,
      [projectId, orgId, ...values]
    );
    return result.rows[0];
  },

  // Delete project
  async deleteProject(projectId, userId) {
    const orgId = await organizationDb.getUserPrimaryOrganization(userId);
    if (!orgId) {
      return null;
    }
    
    const result = await query(
      'DELETE FROM projects WHERE id = $1 AND org_id = $2 RETURNING id',
      [projectId, orgId]
    );
    return result.rows[0];
  }
};

// Note-related database functions
const noteDb = {
  // Create a new note
  async createNote(projectId, type, content, transcription, imageLabel = null, fileKey = null, orgId = null) {
    if (!orgId) {
      // Get organization from project
      const projectResult = await query('SELECT org_id FROM projects WHERE id = $1', [projectId]);
      if (projectResult.rows.length === 0) {
        throw new Error('Project not found');
      }
      orgId = projectResult.rows[0].org_id;
    }
    
    const result = await query(
      'INSERT INTO notes (project_id, type, content, transcription, image_label, file_key, org_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [projectId, type, content, transcription, imageLabel, fileKey, orgId]
    );
    return result.rows[0];
  },

  // Get all notes for a project
  async getProjectNotes(projectId) {
    console.log('Getting notes for project:', projectId);
    const result = await query(
      `SELECT n.*
       FROM notes n
       WHERE n.project_id = $1
       ORDER BY n.created_at DESC`,
      [projectId]
    );
    console.log('Database notes query result:', result.rows.length, 'notes found');
    
    // Generate signed URLs for notes with file_key
    const notesWithUrls = await Promise.all(
      result.rows.map(async (note) => {
        if (note.file_key && process.env.STORAGE_PROVIDER === 's3') {
          note.file_url = await generateSignedUrl(note.file_key);
        }
        return note;
      })
    );
    
    return notesWithUrls;
  },

  // Update note label
  async updateNoteLabel(noteId, userId, newLabel) {
    const orgId = await organizationDb.getUserPrimaryOrganization(userId);
    if (!orgId) {
      return null;
    }
    
    // First verify the note belongs to the user's project
    const result = await query(
      `UPDATE notes 
       SET image_label = $1
       WHERE id = $2 
       AND org_id = $3
       RETURNING *`,
      [newLabel, noteId, orgId]
    );
    return result.rows[0];
  },

  // Update note submission status
  async updateNoteSubmissionStatus(noteId, userId, submitted, individualReport = null) {
    const orgId = await organizationDb.getUserPrimaryOrganization(userId);
    if (!orgId) {
      return null;
    }
    
    const result = await query(
      `UPDATE notes 
       SET submitted = $1, individual_report = $2
       WHERE id = $3 
       AND org_id = $4
       RETURNING *`,
      [submitted, individualReport, noteId, orgId]
    );
    return result.rows[0];
  },

  // Get individual note with submission status
  async getNoteById(noteId, userId) {
    const orgId = await organizationDb.getUserPrimaryOrganization(userId);
    if (!orgId) {
      return null;
    }
    
    const result = await query(
      `SELECT n.*
       FROM notes n
       WHERE n.id = $1
       AND n.org_id = $2`,
      [noteId, orgId]
    );
    
    const note = result.rows[0];
    if (note && note.file_key && process.env.STORAGE_PROVIDER === 's3') {
      note.file_url = await generateSignedUrl(note.file_key);
    }
    
    return note;
  },

  // Add file to note
  async addFileToNote(noteId, fileUrl, fileType, fileName, fileSize) {
    const result = await query(
      'INSERT INTO note_files (note_id, file_url, file_type, file_name, file_size) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [noteId, fileUrl, fileType, fileName, fileSize]
    );
    return result.rows[0];
  },

  // Delete note
  async deleteNote(noteId, userId) {
    const orgId = await organizationDb.getUserPrimaryOrganization(userId);
    if (!orgId) {
      return null;
    }
    
    // First verify the note belongs to the user's project
    const result = await query(
      `DELETE FROM notes 
       WHERE id = $1 
       AND org_id = $2
       RETURNING id`,
      [noteId, orgId]
    );
    return result.rows[0];
  }
};

// Helper function to generate signed S3 URLs
const generateSignedUrl = async (fileKey) => {
  if (!fileKey || process.env.STORAGE_PROVIDER !== 's3') {
    return null;
  }
  
  try {
    const signedUrlTTL = parseInt(process.env.SIGNED_URL_TTL_SECONDS) || 3600; // 1 hour default
    return await presign(fileKey, signedUrlTTL);
  } catch (error) {
    console.error('Failed to generate signed URL:', error);
    return null;
  }
};

// Summary-related database functions
const summaryDb = {
  // Create or update summary
  async upsertSummary(projectId, content, orgId = null) {
    if (!orgId) {
      // Get organization from project
      const projectResult = await query('SELECT org_id FROM projects WHERE id = $1', [projectId]);
      if (projectResult.rows.length === 0) {
        throw new Error('Project not found');
      }
      orgId = projectResult.rows[0].org_id;
    }
    
    // First, try to find existing summary
    const existingResult = await query(
      'SELECT id FROM summaries WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
      [projectId]
    );
    
    if (existingResult.rows.length > 0) {
      // Update existing summary
      const result = await query(
        'UPDATE summaries SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [content, existingResult.rows[0].id]
      );
      return result.rows[0];
    } else {
      // Create new summary
      const result = await query(
        'INSERT INTO summaries (project_id, content, org_id) VALUES ($1, $2, $3) RETURNING *',
        [projectId, content, orgId]
      );
      return result.rows[0];
    }
  },

  // Get summary for project
  async getProjectSummary(projectId) {
    const result = await query(
      'SELECT * FROM summaries WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [projectId]
    );
    return result.rows[0];
  }
};

// Note sharing database functions
const createNoteShare = async (noteId, createdBy, expiresAt = null) => {
  // Create new share token
  const crypto = await import('crypto');
  const token = crypto.randomBytes(24).toString('base64url');
  
  const result = await query(
    'INSERT INTO note_shares (note_id, token, created_by, expires_at) VALUES ($1, $2, $3, $4) RETURNING *',
    [noteId, token, createdBy, expiresAt]
  );
  return result.rows[0];
};

const findActiveShareForNote = async (noteId) => {
  const result = await query(
    'SELECT * FROM note_shares WHERE note_id = $1 AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 1',
    [noteId]
  );
  return result.rows[0];
};

const getShareByToken = async (token) => {
  const result = await query(
    `SELECT ns.*, n.type, n.content, n.transcription, n.image_label, n.created_at as note_created_at,
     p.name as project_name, n.file_key
     FROM note_shares ns
     JOIN notes n ON ns.note_id = n.id
     JOIN projects p ON n.project_id = p.id
     WHERE ns.token = $1
     GROUP BY ns.id, n.id, p.id`,
    [token]
  );
  
  const share = result.rows[0];
  if (share && share.file_key && process.env.STORAGE_PROVIDER === 's3') {
    share.file_url = await generateSignedUrl(share.file_key);
  }
  
  return share;
};

const revokeShare = async (noteId) => {
  const result = await query(
    'UPDATE note_shares SET expires_at = NOW() WHERE note_id = $1 RETURNING *',
    [noteId]
  );
  return result.rows[0];
};

const revokeShareByToken = async (token) => {
  const result = await query(
    'UPDATE note_shares SET expires_at = NOW() WHERE token = $1 RETURNING *',
    [token]
  );
  return result.rows[0];
};

// Named exports
export {
  query,
  pool,
  organizationDb,
  userDb,
  projectDb,
  noteDb,
  summaryDb,
  createNoteShare,
  findActiveShareForNote,
  getShareByToken,
  revokeShare,
  revokeShareByToken,
  generateSignedUrl
};