# Claude Code Context

## Project Overview

CIV Tangle is a relationship graph visualization app. Users select their profile, then view/manage relationships on an interactive force-directed graph.

## Key Architecture Decisions

### Dual Backend System
- **Local dev**: Express.js server (`server/`) with better-sqlite3
- **Production**: Vercel serverless functions (`api/`) with Turso/LibSQL
- Both backends share the same API structure but different implementations

### Database
- Production uses Turso (LibSQL) - connection in `lib/db.js`
- Local uses SQLite file at `server/db/tangle.db`
- Schema defined in `server/db/schema.sql`

### Authentication
- Cookie-based user persistence (`civ_tangle_user`)
- Admin users have PIN codes stored in `admin_code` column
- Admin verification via POST `/api/people/:id/verify-code`

## Important Patterns

### JSX Rendering
Integer 0 renders in JSX, boolean false doesn't. Always use `!!value` for conditional rendering:
```jsx
{!!currentUser.is_admin && <AdminPanel />}  // Correct
{currentUser.is_admin && <AdminPanel />}     // Shows "0" if is_admin is 0
```

### API Routes (Vercel)
File-based routing in `api/` folder:
- `api/people/index.js` -> GET/POST `/api/people`
- `api/people/[id].js` -> GET/PUT/DELETE `/api/people/:id`
- `api/people/[id]/verify-code.js` -> POST `/api/people/:id/verify-code`

### Graph Component
`Graph.jsx` is the main visualization using D3.js:
- Force simulation with collision, charge, and link forces
- Nodes sized by connection count
- Click to select, drag to reposition
- Heart animation on new connections

## Common Tasks

### Add new API endpoint
1. Create route in `server/routes/*.js` for local dev
2. Create serverless function in `api/` for production
3. Use `lib/db.js` for Turso connection in serverless functions

### Modify database schema
1. Update `server/db/schema.sql`
2. Run migration on local: `sqlite3 server/db/tangle.db "ALTER TABLE..."`
3. Run migration on prod: `turso db shell civtangle "ALTER TABLE..."`

### Deploy
```bash
git add . && git commit -m "feat/fix/chore: description"
git push origin main
vercel --prod
```

## Component Overview

| Component | Purpose |
|-----------|---------|
| `App.jsx` | Main app, user state, cookie restoration |
| `Graph.jsx` | D3 force-directed graph visualization |
| `UserPanel.jsx` | Relationship CRUD, admin user selector |
| `WelcomeModal.jsx` | Profile selection with search and PIN input |
| `IdeasPanel.jsx` | Feedback submission with cooldown |
| `ProfileEdit.jsx` | Edit user profile details |
| `Tooltip.jsx` | Hover info on graph nodes |

## Database Commands

```bash
# Local SQLite
sqlite3 server/db/tangle.db "SELECT * FROM people"

# Production Turso
turso db shell civtangle "SELECT * FROM people"
```
