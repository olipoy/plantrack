// Database connection and query utilities
import pkg from 'pg';
const { Pool } = pkg;

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
  async createProject(userId, name, description, location, inspector, projectDate) {
    const result = await query(
      `INSERT INTO projects (user_id, name, description, location, inspector, project_date) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, name, description, location, inspector, project_date, created_at, updated_at`,
      [userId, name, description, location, inspector, projectDate]
    );
    return result.rows[0];
  },

  // Get all projects for a user
  async getUserProjects(userId) {
    const result = await query(
      `SELECT p.*, 
       (SELECT COUNT(*) FROM notes WHERE project_id = p.id) as note_count,
       (SELECT content FROM summaries WHERE project_id = p.id ORDER BY updated_at DESC LIMIT 1) as ai_summary
       FROM projects p 
       WHERE p.user_id = $1 
       ORDER BY p.updated_at DESC`,
      [userId]
    );
    return result.rows;
  },

  // Get a specific project (with ownership check)
  async getProjectById(projectId, userId) {
    const result = await query(
      `SELECT p.*,
       (SELECT content FROM summaries WHERE project_id = p.id ORDER BY updated_at DESC LIMIT 1) as ai_summary
       FROM projects p 
       WHERE p.id = $1 AND p.user_id = $2`,
      [projectId, userId]
    );
    return result.rows[0];
  },

  // Update project
  async updateProject(projectId, userId, updates) {
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 3}`).join(', ');
    const values = Object.values(updates);
    
    const result = await query(
      `UPDATE projects SET ${setClause} WHERE id = $1 AND user_id = $2 RETURNING *`,
      [projectId, userId, ...values]
    );
    return result.rows[0];
  },

  // Delete project
  async deleteProject(projectId, userId) {
    const result = await query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id',
      [projectId, userId]
    );
    return result.rows[0];
  }
};

// Note-related database functions
const noteDb = {
  // Create a new note
  async createNote(projectId, type, content, transcription, imageLabel = null) {
    const result = await query(
      'INSERT INTO notes (project_id, type, content, transcription, image_label) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [projectId, type, content, transcription, imageLabel]
    );
    return result.rows[0];
  },

  // Get all notes for a project
  async getProjectNotes(projectId) {
    console.log('Getting notes for project:', projectId);
    const result = await query(
      `SELECT n.*, 
       json_agg(
         json_build_object(
           'id', nf.id,
           'file_url', nf.file_url,
           'file_type', nf.file_type,
           'file_name', nf.file_name,
           'file_size', nf.file_size
         )
       ) FILTER (WHERE nf.id IS NOT NULL) as files
       FROM notes n
       LEFT JOIN note_files nf ON n.id = nf.note_id
       WHERE n.project_id = $1
       GROUP BY n.id
       ORDER BY n.created_at DESC`,
      [projectId]
    );
    console.log('Database notes query result:', result.rows.length, 'notes found');
    console.log('Notes data:', result.rows.map(n => ({ 
      id: n.id, 
      type: n.type, 
      content: n.content?.substring(0, 30),
      hasFiles: n.files && n.files.length > 0,
      submitted: n.submitted,
      submittedAt: n.submitted_at,
      hasIndividualReport: !!n.individual_report
    })));
    return result.rows;
  },

  // Update note label
  async updateNoteLabel(noteId, userId, newLabel) {
    // First verify the note belongs to the user's project
    const result = await query(
      `UPDATE notes 
       SET image_label = $1
       WHERE id = $2 
       AND project_id IN (SELECT id FROM projects WHERE user_id = $3)
       RETURNING *`,
      [newLabel, noteId, userId]
    );
    return result.rows[0];
  },

  // Update note submission status
  async updateNoteSubmissionStatus(noteId, userId, submitted, individualReport = null) {
    const result = await query(
      `UPDATE notes 
       SET submitted = $1, individual_report = $2
       WHERE id = $3 
       AND project_id IN (SELECT id FROM projects WHERE user_id = $4)
       RETURNING *`,
      [submitted, individualReport, noteId, userId]
    );
    return result.rows[0];
  },

  // Get individual note with submission status
  async getNoteById(noteId, userId) {
    const result = await query(
      `SELECT n.*, 
       json_agg(
         json_build_object(
           'id', nf.id,
           'file_url', nf.file_url,
           'file_type', nf.file_type,
           'file_name', nf.file_name,
           'file_size', nf.file_size
         )
       ) FILTER (WHERE nf.id IS NOT NULL) as files
       FROM notes n
       LEFT JOIN note_files nf ON n.id = nf.note_id
       WHERE n.id = $1
       AND n.project_id IN (SELECT id FROM projects WHERE user_id = $2)
       GROUP BY n.id`,
      [noteId, userId]
    );
    return result.rows[0];
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
    // First verify the note belongs to the user's project
    const result = await query(
      `DELETE FROM notes 
       WHERE id = $1 
       AND project_id IN (SELECT id FROM projects WHERE user_id = $2)
       RETURNING id`,
      [noteId, userId]
    );
    return result.rows[0];
  }
};

// Summary-related database functions
const summaryDb = {
  // Create or update summary
  async upsertSummary(projectId, content) {
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
        'INSERT INTO summaries (project_id, content) VALUES ($1, $2) RETURNING *',
        [projectId, content]
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

// Named exports
export {
  query,
  pool,
  userDb,
  projectDb,
  noteDb,
  summaryDb
};

// Default export
export default {
  query,
  pool,
  userDb,
  projectDb,
  noteDb,
  summaryDb
};