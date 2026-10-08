# PostPilot

**PostPilot** is an AI-powered social media content management platform that helps users create, refine, manage, and schedule social media posts from a single dashboard.

It combines AI-assisted content generation with account management, media generation, scheduling, and automated publishing. The application is deployed as a separate React frontend and Node.js backend.

## Live Demo

**Frontend:** https://post-pilot-six-beta.vercel.app/

**Backend:** Deployed on Render

> The backend URL is intentionally not hard-coded here because the frontend uses the configured `VITE_API_BASE_URL` environment variable.

---

## Why PostPilot?

Creating social media content repeatedly involves several manual steps:

1. Coming up with an idea
2. Writing the post
3. Improving the content
4. Generating or attaching media
5. Connecting social accounts
6. Scheduling the post
7. Publishing it at the right time

PostPilot brings these steps into one workflow.

The goal is not just to generate text with an AI model, but to build a complete content workflow around it.

---

## Core Features

### AI Content Generation

Users can generate social media content from a prompt or idea.

- Groq is used as the primary text-generation provider.
- Gemini is used as a fallback.
- Generated content can be reviewed and edited before publishing.

### AI Image Generation

PostPilot can generate visual content for posts using the Stability AI API.

Generated images are uploaded to Cloudinary so they can be stored and served reliably.

### Social Account Integration

Users can connect supported social accounts through Zernio.

The OAuth flow is handled by the backend, keeping third-party API credentials and integration logic away from the frontend.

### Post Scheduling

Users can create scheduled posts.

A backend scheduler checks for pending scheduled posts every minute and publishes eligible posts through Zernio.

### Dashboard

The dashboard provides a centralized view of:

- Posts
- Generated content
- Connected accounts
- Scheduled content
- Recent activity

### Authentication

The backend uses:

- JWT-based authentication
- Password hashing with bcrypt
- Protected API routes

### Media Storage

Cloudinary is used for storing generated and uploaded media instead of keeping large files directly on the application server.

---

## Application Flow

The overall architecture follows a simple client-server model:

```text
                    ┌─────────────────────┐
                    │       User          │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ React + Vite Client │
                    │ TypeScript + Tailwind│
                    └──────────┬──────────┘
                               │ REST API
                               ▼
                    ┌─────────────────────┐
                    │ Express + TypeScript│
                    │      Backend        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                 │
              ▼                ▼                 ▼
        ┌──────────┐    ┌────────────┐    ┌────────────┐
        │ MongoDB  │    │ AI Services│    │  Zernio    │
        │          │    │            │    │ Social API │
        └──────────┘    └─────┬──────┘    └─────┬──────┘
                              │                 │
                       ┌──────┴──────┐          │
                       │             │          │
                       ▼             ▼          ▼
                     Groq          Gemini     Social
                     Stability AI             Platforms
                       │
                       ▼
                   Cloudinary
```

---

## End-to-End Request Flow

### 1. User Authentication

The user registers or logs in from the React application.

```text
React Client
    │
    │ POST /api/auth/...
    ▼
Express API
    │
    ├── Validate credentials
    ├── Hash/compare password using bcrypt
    └── Generate JWT
           │
           ▼
        Client
```

The JWT is then used to authenticate protected API requests.

### 2. AI Post Generation

```text
User Idea
   │
   ▼
React AI Composer
   │
   │ POST /api/posts/generate
   ▼
Express Backend
   │
   ▼
Groq API
   │
   ├── Success ───────────────► Generated Content
   │
   └── Failure
          │
          ▼
      Gemini API
          │
          ▼
    Generated Content
```

The backend acts as the orchestration layer so API keys are never exposed in the browser.

### 3. Image Generation

```text
Post / Prompt
     │
     ▼
Backend
     │
     ▼
Stability AI
     │
     ▼
Generated Image
     │
     ▼
Cloudinary
     │
     ▼
Stored Media URL
     │
     ▼
Post
```

### 4. Social Account Connection

```text
User
 │
 ▼
Accounts Page
 │
 ▼
Backend OAuth Route
 │
 ▼
Zernio
 │
 ▼
Social Platform Authorization
 │
 ▼
OAuth Callback
 │
 ▼
Backend
 │
 ▼
Account Synced to PostPilot
```

The callback redirects the user back to the application's accounts page after authorization.

### 5. Scheduling and Publishing

The scheduler runs continuously on the backend.

```text
MongoDB
   │
   │ Scheduled posts
   ▼
Node-Cron
   │
   │ Every minute
   ▼
Find pending posts
   │
   ├── Not due yet → Wait
   │
   └── Due
        │
        ▼
      Zernio
        │
        ▼
  Social Platform
        │
        ▼
 Update Post Status
```

This is why the backend is deployed as a continuously running Render Web Service rather than only as a static frontend.

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| React 19 | UI development |
| TypeScript | Type safety |
| Vite | Frontend build tooling |
| Tailwind CSS | Styling |
| React Router | Client-side routing |
| Axios | HTTP communication |

### Backend

| Technology | Purpose |
|---|---|
| Node.js | Runtime |
| Express 5 | REST API |
| TypeScript | Type safety |
| Mongoose | MongoDB ODM |
| JWT | Authentication |
| bcrypt | Password hashing |
| node-cron | Scheduled jobs |
| Multer | File uploads |

### AI and External Services

| Service | Purpose |
|---|---|
| Groq | Primary AI text generation |
| Google Gemini | AI fallback |
| Stability AI | Image generation |
| Zernio | Social account integration and publishing |
| Cloudinary | Image/media storage |
| MongoDB Atlas | Persistent application data |

### Deployment

| Platform | Responsibility |
|---|---|
| Vercel | React frontend |
| Render | Express backend and scheduler |
| MongoDB Atlas | Production database |
| Cloudinary | Media storage |

---

## Project Structure

```text
PostPilot/
│
├── client/
│   ├── src/
│   │   ├── api/
│   │   │   └── axios.ts
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── AIComposer.tsx
│   │   │   ├── Accounts.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Home.tsx
│   │   │   ├── Login.tsx
│   │   │   └── Scheduler.tsx
│   │   └── ...
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
│
├── server/
│   ├── config/
│   │   └── db.ts
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   │   ├── accountRoutes.ts
│   │   ├── authRoutes.ts
│   │   ├── postRoutes.ts
│   │   └── socialAuthRoutes.ts
│   ├── services/
│   │   └── schedulerService.ts
│   ├── server.ts
│   ├── package.json
│   └── .env.example
│
└── README.md
```

---

## API Structure

The backend is organized around resource-specific Express routers.

### Authentication

```text
/api/auth
```

Responsible for registration, login, and authentication-related operations.

### Social OAuth

```text
/api/oauth
```

Handles social account connection, OAuth URLs, callbacks, and account synchronization.

### Accounts

```text
/api/accounts
```

Manages connected social accounts.

### Posts

```text
/api/posts
```

Handles:

- Creating posts
- Fetching posts
- Generating AI content
- Managing generated content

### Activity

```text
/api/activity
```

Provides application activity information for the dashboard.

---

## Environment Variables

### Backend

Create `server/.env`:

```env
MONGODB_URI="your_mongodb_connection_string"
JWT_SECRET="your_jwt_secret"

ZERNIO_API_KEY="your_zernio_api_key"

GROQ_API_KEY="your_groq_api_key"
GEMINI_API_KEY="your_gemini_api_key"
STABILITY_API_KEY="your_stability_api_key"

CLOUDINARY_CLOUD_NAME="your_cloudinary_cloud_name"
CLOUDINARY_API_KEY="your_cloudinary_api_key"
CLOUDINARY_API_SECRET="your_cloudinary_api_secret"
```

### Frontend

Create `client/.env`:

```env
VITE_API_BASE_URL="http://localhost:3000"
```

For production, this should point to the deployed Render backend:

```env
VITE_API_BASE_URL="https://your-render-backend-url"
```

> Never expose backend secrets in the frontend. Vite variables prefixed with `VITE_` are bundled into client-side code.

---

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/dikshaforsure/PostPilot.git
cd PostPilot
```

### 2. Start the backend

```bash
cd server
npm install
```

Create `.env` using the variables described above.

Then run:

```bash
npm run server
```

The backend runs on:

```text
http://localhost:3000
```

### 3. Start the frontend

Open another terminal:

```bash
cd client
npm install
npm run dev
```

Vite will provide the local frontend URL, normally:

```text
http://localhost:5173
```

---

## Production Deployment

### Frontend — Vercel

The `client` directory is deployed as the Vercel project.

Configuration:

```text
Root Directory: client
Build Command: npm run build
Output Directory: dist
```

Production environment variable:

```text
VITE_API_BASE_URL=https://<your-render-backend>
```

Every push to the connected GitHub branch can trigger a new Vercel deployment.

### Backend — Render

The `server` directory is deployed as a Render Web Service.

Configuration:

```text
Root Directory: server
Build Command: npm install && npm run build
Start Command: npm start
```

All backend environment variables are configured in Render.

The backend exposes:

```text
GET /
```

which returns:

```text
Server is Live!
```

### Database — MongoDB Atlas

The production backend connects to MongoDB Atlas using:

```text
MONGODB_URI
```

MongoDB stores users, accounts, posts, generations, and related application data.

---

## Important Engineering Decisions

### 1. Separate Frontend and Backend

The frontend and backend are independently deployable.

This provides:

- Clear separation of concerns
- Independent scaling
- Safer handling of secrets
- Easier debugging
- Cleaner API boundaries

### 2. AI Calls Stay on the Backend

The browser never directly calls Groq, Gemini, or Stability AI using private API keys.

Instead:

```text
Browser → Backend → AI Provider
```

This prevents sensitive credentials from being exposed in client-side JavaScript.

### 3. AI Fallback

Groq is used as the primary text-generation provider, with Gemini available as a fallback.

This improves resilience when the primary provider fails or becomes temporarily unavailable.

### 4. External Media Storage

Images are stored using Cloudinary instead of the application server.

This avoids coupling media storage to the backend instance and makes media delivery more suitable for production.

### 5. Background Scheduler

Scheduling is handled by `node-cron`.

The scheduler checks every minute for posts that are ready to be published.

This requires the backend process to remain alive, which is why the production backend is deployed as a Render Web Service.

---

## Security Considerations

- API secrets are stored as environment variables.
- AI and third-party API calls are performed server-side.
- Passwords are hashed with bcrypt.
- Authentication uses signed JWTs.
- The frontend communicates with the backend through a defined API base URL.
- OAuth integration is handled by the backend rather than exposing provider credentials to the client.

For a larger production deployment, the next security improvements would include stricter CORS configuration, refresh-token rotation, rate limiting, stronger input validation, and more granular authorization.

---

## Interview-Level System Explanation

A concise way to explain PostPilot in an interview:

> **PostPilot is a full-stack AI-powered social media automation platform. I built the frontend using React, TypeScript, Vite, and Tailwind CSS, and the backend using Node.js, Express, TypeScript, and MongoDB. Users can authenticate, generate post content using Groq with Gemini as a fallback, generate images using Stability AI, store media through Cloudinary, connect social accounts through Zernio, and schedule posts for automated publishing. The backend uses a node-cron scheduler that checks every minute for posts that are due and sends them to the publishing provider. I deployed the frontend on Vercel and the backend on Render, with MongoDB Atlas as the production database.**

### If the interviewer asks: "Why did you use this architecture?"

> I separated the frontend and backend so that the browser handles presentation while the backend handles authentication, database operations, AI integrations, OAuth, scheduling, and third-party API calls. This also keeps API secrets on the server and allows the frontend and backend to be deployed independently.

### If asked: "How does scheduling work?"

> When a user schedules a post, the post and its scheduled time are stored in MongoDB. A node-cron job runs every minute on the backend, finds posts whose scheduled time has arrived, publishes them through Zernio, and updates their status. Because the scheduler runs inside the backend process, the backend needs to stay continuously available.

### If asked: "Why not call AI APIs from React?"

> API keys must not be exposed in client-side JavaScript. The frontend sends the user's request to my Express backend, and the backend securely communicates with the AI provider.

### If asked: "What happens if Groq fails?"

> The backend has a fallback path that can use Gemini for text generation, so a temporary failure from the primary provider does not necessarily break the content-generation workflow.

---

## Future Improvements

Possible next steps for PostPilot include:

- More social platform integrations
- Redis-backed job queues instead of an in-process cron scheduler
- Retry and dead-letter handling for failed scheduled posts
- Rate limiting and stronger request validation
- Refresh-token based authentication
- Role-based access control
- Analytics for published posts
- Post performance tracking
- AI-powered content recommendations based on previous performance
- Docker-based deployment
- Automated tests and CI/CD
- Centralized logging and monitoring

---

## Project Highlights

- Full-stack TypeScript application
- RESTful Express backend
- MongoDB-based persistence
- JWT authentication
- AI text generation with provider fallback
- AI image generation
- Cloud media storage
- OAuth-based social account integration
- Automated post scheduling
- Production deployment using Vercel + Render

---

## Repository

**GitHub:** https://github.com/dikshaforsure/PostPilot

**Live Application:** https://post-pilot-six-beta.vercel.app/

---

## Author

**Diksha Anand**

GitHub: https://github.com/dikshaforsure
