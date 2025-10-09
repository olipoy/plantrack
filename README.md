# Inspection Assistant - AI-Powered Facility Management

A modern web application for facility management technicians to conduct inspections with AI-powered transcription, analysis, and chat functionality.

## Features

### 🎙️ Real-time Recording & Transcription
- Voice notes with automatic Swedish transcription using OpenAI Whisper
- Video recording with audio transcription
- Photo capture with metadata
- Up to 20 media files per project

### 🤖 AI-Powered Analysis
- Automatic summarization of inspection notes using GPT-4
- Global AI chat assistant that can search across all projects
- Intelligent responses based on actual project data
- Persistent chat history

### 📱 Mobile-First Design
- Progressive Web App (PWA) capabilities
- Touch-optimized interface
- Responsive design for all screen sizes
- Offline-capable storage

### 🔒 Secure Backend Infrastructure
- Express.js server with file upload handling
- AWS S3 integration for cloud storage (optional)
- Secure API key management
- CORS protection and file validation

## Setup Instructions

### 1. Environment Configuration

Create a `.env` file in the root directory:

```env
# Required: Database Configuration
DATABASE_URL=postgresql://username:password@host:port/database

# Required: JWT Secret (use a strong random string in production)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Required: OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Required: SendGrid Configuration (for email functionality)
SENDGRID_API_KEY=your_sendgrid_api_key_here
FROM_EMAIL=noreply@yourdomain.com

# Production API URL (optional - leave empty for Railway deployment)
# VITE_API_URL=https://your-railway-domain.railway.app

# Optional: AWS S3 Configuration (uses local storage if not provided)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

# CORS Configuration for production
FRONTEND_URL=https://your-railway-domain.railway.app

# Server Configuration
PORT=3001
NODE_ENV=development
```

### 2. Installation

```bash
npm install
```

### 3. Development

Start both the frontend and backend servers:

```bash
npm run dev
```

This will start:
- Frontend (Vite): http://localhost:5173
- Backend (Express): http://localhost:3001

### 4. Production Build

```bash
npm run build
npm start
```

## Deployment to Railway

### 1. Prepare for Deployment

1. Push your code to GitHub
2. Connect your GitHub repository to Railway
3. Set the following environment variables in Railway:

```env
OPENAI_API_KEY=your_openai_api_key_here
SENDGRID_API_KEY=your_sendgrid_api_key_here
FROM_EMAIL=noreply@yourdomain.com
DATABASE_URL=your_database_url_from_railway
JWT_SECRET=your-super-secret-jwt-key
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-railway-domain.railway.app
```

### 2. Railway Configuration

Railway will automatically:
- Build the frontend using `npm run build`
- Install server dependencies
- Start the server using `npm start`
- Serve both the frontend and API from the same domain

### 3. Environment Variables

**Required for Railway:**
- `OPENAI_API_KEY` - Your OpenAI API key
- `SENDGRID_API_KEY` - Your SendGrid API key (for email functionality)
- `FROM_EMAIL` - The sender email address (must be verified in SendGrid)
- `DATABASE_URL` - PostgreSQL database URL (provided by Railway)
- `JWT_SECRET` - Secret key for JWT token generation
- `NODE_ENV=production` - Enables production mode
- `FRONTEND_URL` - Your Railway domain (for CORS)

**Optional:**
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` - For S3 file storage
- `VITE_API_URL` - Only needed if API is on different domain

### 4. How It Works in Production

1. **Single Domain**: Frontend and backend are served from the same Railway domain
2. **Static Files**: Express serves the built React app from `/dist`
3. **API Routes**: All `/api/*` requests go to Express endpoints
4. **File Uploads**: Stored locally on Railway or in S3 if configured
5. **Client Routing**: Express handles React Router by serving `index.html` for non-API routes

## API Endpoints

### File Upload
- `POST /api/upload` - Upload and transcribe media files
- Supports audio, video, and image files up to 100MB
- Automatic transcription for audio/video using Whisper API

### AI Chat
- `POST /api/chat` - Send messages to GPT-4 with project context
- Maintains persistent chat history per user
- Searches across all project data

### Summarization
- `POST /api/summarize` - Generate AI summaries of inspection notes
- Uses GPT-4 to create structured summaries in Swedish

### Health Check
- `GET /api/health` - Check server and API status

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Vite** for build tooling

### Backend
- **Express.js** server
- **OpenAI API** (GPT-4 + Whisper)
- **AWS S3** for file storage (optional)
- **Multer** for file uploads

### Storage
- **LocalStorage** for project data
- **AWS S3** or local filesystem for media files
- **In-memory** chat history (use database in production)

## File Structure

```
src/
├── components/          # React components
│   ├── MediaRecorder.tsx    # Recording interface
│   ├── GlobalAIChat.tsx     # AI chat interface
│   ├── ProjectDetail.tsx    # Project management
│   └── ...
├── utils/              # Utility functions
│   ├── api.ts              # API client
│   ├── storage.ts          # Local storage
│   └── export.ts           # PDF export
├── types/              # TypeScript definitions
└── ...

server/
├── index.js            # Express server
└── uploads/            # Local file storage
```

## Production Considerations

### Database
Replace in-memory storage with a proper database:
- PostgreSQL or MongoDB for project data
- Redis for chat history and sessions

### File Storage
Configure AWS S3 for production file storage:
- Set up S3 bucket with proper CORS policies
- Configure CloudFront for CDN delivery
- Implement file cleanup policies

### Security
- Use environment variables for all secrets
- Implement rate limiting
- Add authentication and authorization
- Validate and sanitize all inputs

### Monitoring
- Add logging with Winston or similar
- Implement health checks and metrics
- Set up error tracking (Sentry)

## License

MIT License - see LICENSE file for details.