# CIV Tangle

A relationship graph visualization app built for the CIV community. Users can map and visualize connections between people using an interactive D3.js force-directed graph.

## Features

- **Interactive Graph**: D3.js force-directed graph showing people as nodes and relationships as edges
- **Profile System**: Users select their profile on first visit (persisted via cookies)
- **Relationship Management**: Add/edit/delete relationships with different intensity levels
- **Admin System**: PIN-protected admin accounts can manage all users' relationships
- **Ideas Panel**: Submit feedback/ideas with 30-minute cooldown
- **Avatar Upload**: Upload and crop profile pictures
- **Search**: Filter profiles by name in the selection menu

## Tech Stack

### Frontend
- React 18 with Vite
- D3.js for graph visualization
- CSS with CSS variables for theming

### Backend
- Express.js (local development)
- Vercel Serverless Functions (production)
- SQLite via better-sqlite3 (local)
- Turso/LibSQL (production)

## Project Structure

```
├── client/                 # React frontend
│   └── src/
│       ├── components/     # React components
│       │   ├── Graph.jsx       # Main D3 graph visualization
│       │   ├── UserPanel.jsx   # Relationship management panel
│       │   ├── WelcomeModal.jsx # Profile selection modal
│       │   ├── IdeasPanel.jsx  # Feedback submission
│       │   └── ...
│       ├── utils/
│       │   └── graphMetrics.js # Graph analysis utilities
│       └── App.jsx
├── server/                 # Express backend (local dev)
│   ├── routes/
│   │   ├── people.js
│   │   ├── relationships.js
│   │   └── ideas.js
│   ├── db/
│   │   ├── schema.sql
│   │   └── tangle.db
│   └── database.js
├── api/                    # Vercel serverless functions (prod)
│   ├── people/
│   ├── relationships/
│   └── ideas/
├── lib/
│   └── db.js              # Turso database connection
└── vercel.json            # Vercel configuration
```

## Database Schema

### people
- `id`, `first_name`, `last_name`, `avatar`, `bio`
- `is_civ` - Part of CIV community
- `is_admin`, `admin_code` - Admin authentication

### relationships
- `person1_id`, `person2_id` - Linked people
- `intensity` - Relationship type (kiss, sexy, love)
- `date`, `context` - Optional metadata

### ideas
- `sender_id`, `content`, `created_at`

## Development

```bash
# Install dependencies
npm install
cd client && npm install

# Run locally (Express + Vite)
npm run dev

# Build for production
npm run build
```

## Deployment

Deployed on Vercel with Turso database:
- Frontend: Static files from `client/dist`
- Backend: Serverless functions in `api/`
- Database: Turso LibSQL

```bash
# Deploy to production
vercel --prod
```

## Environment Variables

```
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```
