# QR Code Based Attendance System

A modern, serverless classroom attendance app built for the web. The teacher projects a **QR code that changes every 20 seconds**. Students scan it with their phone camera, open a simple web app, and enter their roll number. 

### Key Features
1. **Rotating QR Codes**: Prevents students from taking screenshots and sending them to friends at home. The QR token expires quickly.
2. **Device Fingerprinting (Anti-Proxy)**: Prevents a single student from marking attendance for multiple friends. Once a phone submits a roll number, it gets a signed HTTP-only cookie. If the same phone tries to submit a different roll number, it gets blocked.
3. **Modern Premium UI**: Built with Tailwind CSS, featuring glassmorphism and a sleek dark mode.
4. **Serverless Architecture**: Hosted entirely in the cloud with zero local infrastructure needed.

---

## Architecture

```text
  Teacher browser                         Student phone camera
        |                                         |
        |  poll /current-qr every 5s              |  opens URL from QR
        v                                         v
+------------------+                     +------------------+
|  Vercel Edge/App |  GET /mark          |  mark-attendance |
|  (Express)       | <-------------------+  form (roll no.) |
+----+--------+----+                     +--------+---------+
     |        |                                   |
     |        | Redis GET/SET token               | POST /mark (checks Cookie)
     v        v                                   v
+---------+  +-------------------+       +------------------+
| Neon DB |  | Upstash Redis     |       | Prisma insert    |
| (PgSQL) |  | session:{id}:token|       | Attendance       |
|         |  | TTL 25s           |       | UNIQUE(session,  |
+---------+  +-------------------+       |   student)       |
                                         +------------------+
```

Request path: **route → controller → service → Prisma/Redis**. QR images are generated only when the dashboard asks for them (lazy).

## Packages Used

| Package | Role |
|---------|------|
| `express` | HTTP server and routing |
| `ejs` | Server-rendered HTML |
| `cookie-parser` | Reads and encrypts device cookies to prevent proxy marking |
| `@prisma/client` | Schema, migrations, type-safe SQL |
| `ioredis` | Redis client with TTL (`SET … EX`, `PTTL`) |
| `qrcode` | URL → PNG data URL |
| `json2csv` | Attendance rows → CSV download |

---

## Deployment (Vercel + Neon + Upstash)

The project is designed to be hosted for free on Vercel.

**1. Create Free Databases**
- **Neon** (Postgres): Create a project at [neon.tech](https://neon.tech) and copy the `DATABASE_URL`.
- **Upstash** (Redis): Create a database at [upstash.com](https://upstash.com) and copy the `rediss://` URL.

**2. Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/qr-attendance.git
git push -u origin main
```

**3. Deploy on Vercel**
- Go to [vercel.com](https://vercel.com) and import your GitHub repository.
- Add the following **Environment Variables**:
  - `DATABASE_URL="postgresql://..."`
  - `REDIS_URL="rediss://..."`
  - `COOKIE_SECRET="super-secret-key"`
  - `QR_ROTATION_SECONDS="20"`
  - `QR_TOKEN_TTL_SECONDS="25"`
- Click **Deploy**.

**4. Push Database Schema**
Once deployed, sync your Neon database with Prisma by running this locally:
```bash
set DATABASE_URL="postgresql://..."
npx prisma db push
```

---

## Design Decisions

**Why Redis, not a JS variable?**  
`SET key token EX 25` and `PTTL` give expiry without extra timers. Since Vercel uses serverless functions that spin up and down, storing the token in memory would fail instantly. Redis acts as the single source of truth across all serverless instances.

**Why ~20 second rotation?**  
Shorter (e.g. 3s) and students cannot finish a scan. Longer (e.g. 5 minutes) and a screenshot is useful again. 20s display + 25s Redis TTL leaves a small overlap so a scan started just before rotation can still POST successfully.

**Why Signed Cookies for Anti-Proxy?**  
We don't want a heavy login system because it slows down the class. By dropping an HTTP-only signed cookie after a successful mark, we invisibly bind that device to that specific roll number for the session.

**Why UNIQUE `(sessionId, studentId)` in the database?**  
If a student double-taps the submit button rapidly, two requests hit the database at the same time. The unique index makes the second `INSERT` fail; we catch Prisma `P2002` and show a friendly message.

## Project Layout

```text
qr-attendance-system/
├── prisma/schema.prisma     (Database tables)
├── src/
│   ├── config/              (DB & Redis connections)
│   ├── controllers/         (HTTP logic & cookie handling)
│   ├── services/            (Core logic: qrService, attendanceService)
│   ├── routes/              (Express routers)
│   ├── views/               (EJS templates + Tailwind)
│   ├── public/              (Client-side JS/CSS)
│   └── app.js               (Express setup)
├── vercel.json              (Serverless config)
└── package.json
```
