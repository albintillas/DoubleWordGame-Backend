# Double Word Game Backend

Node.js + Socket.IO backend powering the cooperative Double Word party game.

## Getting Started

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Copy the sample environment and adjust as needed:
   ```powershell
   copy .env.example .env
   ```
3. Run in development mode with auto-reload:
   ```powershell
   npm run dev
   ```

The server listens on `PORT` (defaults to `3000`). Socket.IO and REST endpoints share the same origin.

## Project Structure

```
src/
  app.js              # Express application bootstrapping
  server.js           # HTTP + Socket.IO server entry point
  config/
    env.js            # Environment configuration helpers
  game/
    constants.js      # Tunable gameplay constants
    lobbyManager.js   # Lobby lifecycle + in-memory state management
    models.js         # Player, Team, Lobby structures
    wordList.js       # Sample fallback word list
  socket/
    index.js          # Socket.IO wiring and middleware
    events.js         # Socket event handlers
    helpers.js        # Shared emit/broadcast utilities
  utils/
    codeGenerator.js  # Lobby code utilities
    logger.js         # Minimal structured logging
routes/
  health.js           # REST health check endpoint
  admin.js            # Admin monitoring and control routes
documents/
  backend-implementation.md  # System architecture & server behaviour
  unity-integration-guide.md # Detailed Unity ↔️ backend wiring steps
```

## Scripts

- `npm run dev` – start with Nodemon for local development.
- `npm start` – run the production build with Node.
- `npm run lint` – lint the codebase with ESLint.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP server port. |
| `NODE_ENV` | Environment name (development, production, test). |
| `ALLOWED_ORIGINS` | Comma-separated list for CORS/Socket.IO origin checks. |
| `POINTS_TO_WIN` | Points required for a team victory. |
| `MAX_ROUNDS` | Hard round cap to prevent infinite play. |
| `SUBMISSION_TIMEOUT_MS` | Milliseconds before a team auto-fails a round (default 10000). |
| `ADMIN_USERNAME` | Admin basic-auth user for `/admin` routes. |
| `ADMIN_PASSWORD` | Admin basic-auth password for `/admin` routes. |

## Admin Monitoring

- Basic authentication protects every `/admin` route (defaults: `admin` / `change-me`).
- `GET /admin/stats` – aggregate lobby counters.
- `GET /admin/lobbies` – enumerate active lobbies.
- `GET /admin/lobbies/:code` – full lobby snapshot; pass `?includeHistory=false` to trim the response.
- `GET /admin/config` – exposes live gameplay configuration.
- `POST /admin/lobbies/:code/rounds/current/force-failure` – immediately fail the active round (reason defaults to `admin`).

Refer to `documents/unity-integration-guide.md` for a complete Unity client wiring walkthrough.

## Production Notes

- Deploy on an always-on host (AWS EC2, Google Compute Engine, etc.) for stable WebSocket connectivity.
- Use a process manager (PM2, systemd) to keep the Node process alive.
- Configure HTTPS/SSL termination (e.g., via Nginx reverse proxy) and update `ALLOWED_ORIGINS` accordingly.
- Persistence can be added later by replacing the in-memory lobby store with an external database.
