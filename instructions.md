# 🎯 Project Overview – Multiplayer Word Game

## 🧩 Game Concept

A web-based cooperative party game where players join lobbies and play in teams of two.  
Each round, one team receives a hidden word (e.g., “Hamburger”).  
Both teammates then write one related word simultaneously (e.g., “Bread”, “Meat”).  
- If both write the same word → they score and move to the next round.  
- If they write different words → those two new words become the next pair to “connect” in the following turn.  

The gameplay alternates between teams until a win condition or round limit is reached.

This structure creates fun, intuitive collaboration and word association challenges — perfect for a web-based social game.

---

## ⚙️ Technical Stack Overview

| Layer | Technology | Purpose |
|-------|-------------|----------|
| **Game Frontend** | **Unity (WebGL build)** | Game logic, UI, animations, networking via WebSockets |
| **Frontend Hosting** | **Vercel** or **GitHub Pages** | Hosts the static WebGL build; fast, free, and reliable |
| **Backend** | **Node.js** with **Socket.IO** | Handles multiplayer logic, lobbies, turns, and messaging |
| **Backend Hosting** | **AWS EC2 (Free Tier)** or **Google Cloud Compute Engine (Free Tier)** | Always-on backend to handle real-time connections |
| **Database** | **Supabase** | Stores game stats, lobby history, or player data |
| **Realtime Communication** | **Socket.IO (WebSockets)** | Maintains persistent connections between players and server |

---

## 🕹️ Architecture Diagram

Unity WebGL (Frontend)
│
▼
Socket.IO Client
│
▼
Node.js + Socket.IO Server (Backend)
│
├── In-memory game state (active lobbies)
└── Optional: Supabase (persistent storage)


- The **Unity WebGL** build acts as the client interface for players.
- The **Node.js backend** manages lobbies, teams, and turn order.
- **Socket.IO** ensures real-time updates and smooth gameplay.
- **Supabase** can optionally store match results or ongoing sessions.

---

## 🌐 Hosting Strategy

### 🟩 Frontend (Unity WebGL)
- **Host on Vercel or GitHub Pages.**
  - Ideal for static frontends (HTML/CSS/JS/WebGL).
  - Free, easy to deploy, and highly reliable.
  - Simply upload your `/Build` folder as a static site.

### 🟩 Backend (Node.js + Socket.IO)
The backend must remain online and support persistent connections — meaning **no auto-sleep**.

Render, Railway, and Heroku’s free tiers are **not suitable**, because:
- They **suspend the server** after inactivity (typically 15–30 min).
- Socket.IO connections break when the server sleeps.

**Recommended free/cheap options:**

| Provider | Pros | Notes |
|-----------|------|-------|
| **AWS EC2 (Free Tier)** | Always-on, reliable, free for 12 months | Full control; requires minor setup |
| **Google Cloud Compute Engine (Free Tier)** | Always-on, low latency, stable | f1-micro instance is free indefinitely |
| **Azure for Students** | $100 credits, no credit card required | Great for university projects |
| **(Avoid)** Render, Railway, Fly.io (free tiers) | Auto-sleep after inactivity | Not suitable for real-time games |

The backend is lightweight, so a free-tier virtual machine (EC2, GCE) is more than enough for small-scale multiplayer sessions.

---

## 💾 Database (Supabase)

Supabase is only needed if:
- You want to persist lobby state or stats between sessions.
- You want login systems or user profiles.

Otherwise, for simple real-time games, **in-memory state** (on the Node.js server) is sufficient.

Supabase can later be added for:
- Storing match results.
- Saving user progress or leaderboards.
- Logging game analytics.

---

## 🧠 Technical Design Notes

- The **Node.js backend** and **Socket.IO** run on the same server and process.  
  Socket.IO handles real-time communication, while Node handles routing and setup.
- The **WebGL client** connects directly to the backend using a secure WebSocket URL (e.g., `wss://your-ec2-ip:3000`).
- For CORS security, only the Vercel or GitHub Pages domain is allowed to communicate with the backend.
- Backend should be kept alive using a lightweight process manager (like PM2) on the VM.

---

## 📦 Game Development in Unity

- Start from the **“2D Core”** or **“Universal 2D”** template in Unity.
  - A 3D template (like "Small Scale Competitive Multiplayer") isn’t necessary unless you want a 3D world.
- Use **UnityWebRequest** or a **WebSocket** library (like `BestHTTP` or `Socket.IO for Unity`) for networking.
- The UI can be implemented using Unity’s **UI Toolkit** or standard **Canvas system**.

---

## 🔐 Networking Flow Summary

1. **Players load** the Unity WebGL game from Vercel/GitHub.
2. On the main menu, they **enter a lobby code** or **create a new lobby**.
3. The game **connects via Socket.IO** to the Node.js backend.
4. Backend **creates or joins** a lobby (stored in memory).
5. Backend **broadcasts events** to all players in the same lobby:
   - Player joined
   - New round started
   - Guess submitted
   - Round result
6. Optionally, **Supabase** logs the results asynchronously.

---

## 🧰 Development Tools

| Tool | Purpose |
|------|----------|
| **Unity** | Game creation and WebGL export |
| **Node.js** | Backend runtime |
| **Socket.IO** | WebSocket-based communication |
| **PM2** | Keeps Node.js server alive 24/7 |
| **Supabase** | Database (optional) |
| **Vercel / GitHub Pages** | Frontend hosting |
| **AWS / Google Cloud VM** | Backend hosting |

---

## 🧾 Summary of Key Decisions

| Topic | Decision | Reason |
|--------|-----------|--------|
| **Frontend Framework** | Unity WebGL | Familiar workflow, better control of visuals & UI |
| **Backend Technology** | Node.js + Socket.IO | Simple, scalable, works perfectly for multiplayer |
| **Frontend Hosting** | Vercel or GitHub Pages | Free, fast, easy deployment |
| **Backend Hosting** | AWS EC2 / Google Cloud VM | Always-on, free-tier options, stable real-time support |
| **Database** | Supabase (optional) | Simple integration, free tier, managed Postgres |
| **Serverless Platforms (Vercel/Render)** | ❌ Not used | Don’t support persistent WebSockets |
| **Realtime System** | WebSockets via Socket.IO | Maintains continuous player connections |
| **Persistence** | In-memory during game; Supabase optional | Keeps things lightweight during MVP stage |

---

## 🧭 Future Improvements

- Add Supabase persistence (leaderboards, saved stats)
- Implement authentication (Supabase Auth)
- Add animations and sound effects in Unity
- Scale backend for more concurrent lobbies
- Add game replays or result summaries

---

## ✅ Summary

This architecture enables:
- A free-to-host, always-on multiplayer environment  
- A clean separation between frontend and backend  
- Minimal latency using WebSockets  
- Future-proof expansion options with Supabase and Unity animations  

With this plan, the game can be developed quickly, tested locally, and deployed globally with zero cost for most student-scale use cases.

---

**Maintained by:**  
🎨 *Unity Team – Frontend / UX*  
⚙️ *Node.js Team – Backend & Infrastructure*  
🧮 *Supabase Integration – Optional Data Layer*
