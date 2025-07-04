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
# Required: OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Optional: AWS S3 Configuration (uses local storage if not provided)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

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
```

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