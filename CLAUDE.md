# Claude Code Context

## Formatting

- This project uses **single quotes** and its own Prettier config. Do NOT run `prettier --write` on files — it will reformat to double quotes and break the project's style.

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

**Important — Vercel catch-all routing quirk:** `[[...params]].js` (optional catch-all) does **not** match zero-segment base paths like `/api/people` (no trailing segment). It only matches when at least one param is present. This is why each route directory has both an `index.js` (handles the base path) and a `[[...params]].js` (handles `:id` and sub-routes). **Do not remove the `index.js` files** — doing so breaks base-path API calls in production (e.g. fetching the people list on app load).

### Graph Component
`Graph.jsx` is the main visualization using D3.js:
- Force simulation with custom 1/r² repulsion + 1/r attraction physics
- **Curved edges**: Cubic Bezier curves that automatically curve away from nearby nodes
- Nodes sized by connections, betweenness centrality, or both
- Progressive reveal animation on page load (BFS from current user)
- CIV badge on certified nodes (toggleable)

### Edge Styling
- Three intensity levels: kiss (red), cuddle (orange), couple (pink)
- Hidden relationships shown as dashed lines
- Edges curve smoothly to avoid overlapping nodes using `calculateCurvedPath()`

### Settings Panel
- Custom dot-based sliders with 6 discrete steps (draggable)
- Repulsion and Edge Distance controls
- CIV Badge toggle
- Node size mode selector (connections/influence/both)

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
# Development branch
git add -A && git commit -m "feat/fix/chore: description"
git push origin dev

# Production (triggers Vercel auto-deploy)
git checkout main && git merge dev && git push origin main
git checkout dev
```

## Component Overview

| Component | Purpose |
|-----------|---------|
| `App.jsx` | Main app, user state, cookie restoration, notification badges |
| `Graph.jsx` | D3 force-directed graph with curved edges, settings panel, reveal animation |
| `UserPanel.jsx` | Relationship CRUD, admin user selector, profile deletion |
| `WelcomeModal.jsx` | Profile selection with search and PIN input |
| `ChatroomPanel.jsx` | Chatroom with messages, cooldown, voting |
| `ProfileEdit.jsx` | Edit user profile details (admin can edit any user) |
| `Tooltip.jsx` | Hover info on graph nodes with colored intensity dots |
| `ConfirmModal.jsx` | Confirmation dialogs for destructive actions |

## Relationship Intensities

| Intensity | Color | CSS Variable |
|-----------|-------|--------------|
| kiss | `#ff6b6b` (red) | `intensity-kiss` |
| cuddle | `#ffaa55` (orange) | `intensity-cuddle` |
| couple | `#ff99cc` (pink) | `intensity-couple` |
| hidden | `#888888` (gray) | `intensity-hidden` |

## Database Schema

```sql
people: id, first_name, last_name, bio, avatar, is_admin, admin_code, is_pending
relationships: id, person1_id, person2_id, intensity, date, context, is_pending
ideas: id, user_id, text, created_at, status (pending/accepted/rejected)
idea_votes: id, idea_id, user_id, value (-1 or 1)
```

## Database Commands

```bash
# Local SQLite
sqlite3 server/db/tangle.db "SELECT * FROM people"

# Production Turso
turso db shell civtangle "SELECT * FROM people"
```
