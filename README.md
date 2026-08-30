# QR Code Based Attendance System (Rotating QR Anti-Cheat)

A classroom attendance app for a teacher laptop and student phones. The teacher projects a **QR code that changes about every 20 seconds**. Students scan it with the built-in camera, open a normal URL, and enter their roll number. There is no login system: identity is the roll number.

Postgres stores sessions, students, and attendance. Redis holds the **current one-time token** for each live session so expiry is reliable and would still work if you later ran more than one Node process.

## The problem this solves

If you display a **static** QR for the whole lecture, a student can screenshot it and send it to a friend who is not in the room (proxy attendance). A **rotating** token stored in Redis with a short TTL makes an old screenshot useless: the mark endpoint only accepts the token that Redis currently holds. Twenty seconds is long enough to scan from a seat, and short enough that sharing a photo is usually too late.

## Architecture (text diagram)

```
  Teacher browser                         Student phone camera
        |                                         |
        |  poll /current-qr every 5s              |  opens URL from QR
        v                                         v
+------------------+                     +------------------+
|  Express + EJS   |  GET /mark          |  mark-attendance |
|  (this app)      | <-------------------+  form (roll no.) |
+----+--------+----+                     +--------+---------+
     |        |                                   |
     |        | Redis GET/SET token               | POST /api/attendance/mark
     v        v                                   v
+---------+  +-------------------+       +------------------+
| Prisma  |  | Redis             |       | Prisma insert    |
| Session |  | session:{id}:token|       | Attendance       |
| Student |  | TTL 25s           |       | UNIQUE(session,  |
| Attend. |  +-------------------+       |   student)       |
+----+----+                              +--------+---------+
     |
     v
 PostgreSQL (Docker)
```

Request path: **route → controller → service → Prisma/Redis**. QR images are generated only when the dashboard asks for them (lazy), not on a server `setInterval`.

## Extra files beyond the original tree

| File | Why |
|------|-----|
| `docker-compose.yml` | You asked to run **without** local Postgres/Redis installs. |
| `src/utils/` | Shared HTTP errors and `wrapAsync` so controllers stay readable. |
| `.env` | Local copy of `.env.example` for Docker defaults. Do not commit secrets in a real deployment. |

**Packages (keep this list small for your viva):**

| Package | Role |
|---------|------|
| `express` | HTTP server and routing |
| `ejs` | Server-rendered HTML |
| `dotenv` | Load `.env` into `process.env` |
| `@prisma/client` + `prisma` | Schema, migrations, type-safe SQL |
| `ioredis` | Redis client with TTL (`SET … EX`, `PTTL`) |
| `qrcode` | URL → PNG data URL |
| `json2csv` (v5) | Attendance rows → CSV download |

`dotenv` is the only extra runtime library beyond the stack you named; without it you would have to export every variable in the shell.

## Setup (Docker Postgres + Redis)

**Need:** Node.js 18+, Docker Desktop (running).

```bash
cd qr-attendance-system

# 1. Start PostgreSQL and Redis
docker compose up -d

# 2. Install Node dependencies
npm install

# 3. Environment (already matches docker-compose if you copy the example)
copy .env.example .env
# macOS/Linux: cp .env.example .env

# 4. Create tables
npx prisma generate
npx prisma migrate deploy

# 5. Run the app (Node --watch restarts on file changes)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (redirects to create session).

### Phones on the same Wi-Fi

`localhost` inside a QR only works on the teacher machine. Set `BASE_URL` to your LAN address, for example:

```env
BASE_URL="http://192.168.1.10:3000"
```

Restart `npm run dev` after changing `.env`. Allow Node through the Windows firewall if phones cannot open the page.

## How students are created

`Student.id` **is** the roll number (e.g. `21CS045`). If that row does not exist, we **upsert** it and set `name` to the optional name field, or to the roll number if name is blank.

## Manual test plan (build order)

### 1. Database

```bash
docker compose ps
npx prisma studio
```

You should see empty `Session`, `Student`, `Attendance` tables.

### 2. Redis

```bash
docker exec -it qr-attendance-redis redis-cli ping
```

Expect `PONG`.

### 3. Session creation

1. Visit `http://localhost:3000/session/new`
2. Submit class name `CS401 Lab`
3. You should land on `/session/<uuid>/dashboard`

Or:

```bash
curl -s -D - -o NUL -X POST http://localhost:3000/api/sessions ^
  -H "Content-Type: application/x-www-form-urlencoded" ^
  -d "className=CS401 Lab"
```

(Expect `302` to `/session/.../dashboard`.)

### 4. Rotating QR

Replace `SESSION_ID` with the UUID from the dashboard URL:

```bash
curl -s http://localhost:3000/api/sessions/SESSION_ID/current-qr
```

Expect JSON `{ "qrImageDataUrl": "data:image/png;base64,...", "expiresInSeconds": ... }`.

Call it twice within a few seconds: `expiresInSeconds` should drop, image can stay the same. Wait until under 3 seconds remain (or ~25s) and call again: token (hence QR) should change.

Leave Redis down (`docker stop qr-attendance-redis`) and call the same URL: **503** with a Redis message, process still running. Start Redis again: `docker start qr-attendance-redis`.

### 5. Student mark flow

From the JSON, decode the QR or read Redis:

```bash
docker exec -it qr-attendance-redis redis-cli GET session:SESSION_ID:token
```

Open:

`http://localhost:3000/mark?session=SESSION_ID&token=THAT_TOKEN`

Submit roll `21CS045`. You should see a success page.

### 6. Dashboard live list

Keep the teacher dashboard open. Mark another roll in a second tab. Within ~4 seconds the table and **N students present** should update without a full reload.

### 7. End + CSV

Dashboard **End session**, or:

```bash
curl -s -X POST http://localhost:3000/api/sessions/SESSION_ID/end
```

Then:

```bash
curl -s -D - -o attendance.csv http://localhost:3000/api/sessions/SESSION_ID/export
```

Scan the old QR again: **Session ended**. Download CSV: columns `Roll Number`, `Name`, `Marked At Time`.

## Edge cases

| Case | Expected |
|------|----------|
| Expired token | Page: “This QR code has expired…” |
| Same roll twice | “You are already marked present…” (DB unique constraint, Prisma `P2002`) |
| Session `ENDED` | “Session ended” on GET `/mark` and POST mark |
| Redis down | QR endpoints **503**, server does not crash |
| Rotation race | Mark compares body token to **Redis GET**, not an in-memory clock |
| Bad session UUID | **404**, not a stack trace |

## API list

### `POST /api/sessions`

Form field: `className`.

**Response:** `302` → `/session/:id/dashboard`.

Missing `className` → `400`.

### `GET /api/sessions/:id/current-qr`

**200**

```json
{
  "qrImageDataUrl": "data:image/png;base64,...",
  "expiresInSeconds": 22
}
```

Ended session → `410`. Unknown id → `404`. Redis down → `503`.

### `GET /api/sessions/:id/attendance`

**200**

```json
{
  "count": 1,
  "students": [
    { "rollNumber": "21CS045", "name": "21CS045", "markedAt": "2026-08-30T08:00:00.000Z" }
  ]
}
```

### `POST /api/sessions/:id/end`

**200** `{ "message": "Session ended", "session": { ... } }`

### `GET /api/sessions/:id/export`

CSV download (`Content-Disposition: attachment`).

### `GET /mark?session=&token=`

HTML form, or error/ended/expired page.

### `POST /api/attendance/mark`

Body (form or JSON): `sessionId`, `token`, `studentId`, optional `studentName`.

HTML confirmation, already-marked, expired, or session-ended page. Missing fields → `400`.

## Design decisions

**Why Redis, not a JS variable?**  
`SET key token EX 25` and `PTTL` give expiry without extra timers. An in-memory `Map` dies on process restart and does not stay consistent if you ever run two Node instances. Redis is the single source of truth for “which token is live.”

**Why ~20 second rotation?**  
Shorter (e.g. 3s) and students cannot finish a scan. Longer (e.g. 5 minutes) and a screenshot is useful again. 20s display + 25s Redis TTL leaves a small overlap so a scan started just before rotation can still POST successfully.

**Why UNIQUE `(sessionId, studentId)` in the database?**  
An application-only “select then insert” loses a race: two phones with the same roll can both pass the check and insert twice. The unique index makes the second `INSERT` fail; we catch Prisma `P2002` and show a friendly message.

**Why lazy QR generation (no server `setInterval`)?**  
Work happens only while a teacher dashboard is polling. Token validity is still Redis TTL, so whichever HTTP request creates the token, it lasts the full TTL.

## Project layout

```
qr-attendance-system/
├── docker-compose.yml
├── prisma/schema.prisma
├── src/
│   ├── config/db.js, redis.js
│   ├── controllers/
│   ├── services/qrService.js, attendanceService.js
│   ├── routes/
│   ├── views/
│   ├── public/
│   └── app.js
└── package.json
```
