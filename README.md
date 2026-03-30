# Tic Tac Toe Online

Modern Tic Tac Toe web app with three play modes:
- In Person (2 players on one device)
- vs Computer (Easy, Medium, Hard)
- Online Multiplayer (real-time via Socket.IO)

## Demo Highlights

- Responsive UI optimized for desktop and mobile browsers
- 3D-inspired visual design with custom favicon
- Server-authoritative online gameplay
- Private room codes and quick match queue
- Reconnect grace window for online matches

## Tech Stack

### Frontend
- React 18
- Vite 5
- Vanilla CSS (responsive + touch-friendly)
- Socket.IO Client

### Backend
- Node.js (ESM)
- Express
- Socket.IO
- In-memory room/session management (v1)

## Gameplay Modes

### 1) In Person
- Two local players (`X` and `O`) alternate turns
- Win and draw detection
- Restart support

### 2) Play Against Computer
- `Easy`: random valid moves
- `Medium`: tactical logic (win/block/center/corners)
- `Hard`: minimax-based optimal play

### 3) Online Multiplayer (V1)
- Create room + share room code
- Join room by code
- Quick match pairing
- Server validates turns/moves and broadcasts state
- Restart requires both players
- 30-second reconnect grace period

## Project Structure

```text
.
|-- src/
|   |-- App.jsx
|   |-- App.css
|   `-- online/
|       `-- useOnlineGame.js
|-- server/
|   `-- index.js
|-- public/
|   `-- favicon.svg
|-- index.html
`-- package.json
```

## Local Development

### Prerequisites
- Node.js 18+ (recommended: latest LTS)
- npm 9+

### Install

```bash
npm install
```

### Run client + server together

```bash
npm run dev
```

- Client: [http://localhost:5173](http://localhost:5173)
- Server: [http://localhost:3001](http://localhost:3001)

### Run separately

```bash
npm run dev:client
npm run dev:server
```

## Available Scripts

- `npm run dev` - run frontend and backend concurrently
- `npm run dev:client` - run Vite frontend only
- `npm run dev:server` - run Node server with watch mode
- `npm run build` - production build for frontend
- `npm run preview` - preview built frontend
- `npm run start:server` - start backend in normal mode

## Online API (Socket Events)

### Client -> Server
- `online:create_room`
- `online:join_room`
- `online:quick_match`
- `online:make_move`
- `online:restart_request`
- `online:leave_room`

### Server -> Client
- `online:session`
- `online:room_created`
- `online:match_ready`
- `online:state_update`
- `online:restart_applied`
- `online:player_left`
- `online:error`

## Deployment Notes

- Frontend can be deployed on any static host (Vercel, Netlify, GitHub Pages for UI only).
- Backend requires a Node runtime that supports WebSockets.
- For production, set `VITE_SOCKET_URL` in frontend environment to your backend URL.
- Current backend storage is in-memory; rooms reset when server restarts.

## Roadmap

- Persistent game/session storage
- Spectator mode
- Authenticated user profiles
- Match history + leaderboard

## License

Use and modify freely for personal/learning projects.