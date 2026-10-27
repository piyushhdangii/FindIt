# FindIt

FindIt is a community lost-and-found app. People can post lost or found items, discover possible matches, privately verify claims, and coordinate returns. Administrators have separate tools for reviewing disputes and moderating reports.

## Demo video

Add a link to a walkthrough here when it is ready:

**[▶ Watch the FindIt demo](YOUR_DEMO_VIDEO_URL)**

Replace `YOUR_DEMO_VIDEO_URL` with a YouTube, Google Drive, or GitHub video link. For GitHub, upload the video to an issue or pull request comment and use the generated attachment URL.

## Features

- Create an account and sign in with a secure, HTTP-only session cookie.
- Post lost and found reports, then search and filter community reports.
- See explainable lost/found suggestions based on item details, category, color, location, and date. A match score is a discovery aid, not proof of ownership.
- Submit and review private claims, with claim history and duplicate-claim protection.
- Coordinate a return through claim-scoped private chat with persistent message history and live Socket.IO updates.
- Confirm an item return. The report is marked recovered and competing active claims are closed.
- Mark a lost report recovered from the owner dashboard while retaining its history.
- Receive persistent notifications for matches, claims, chat, and moderation activity. Opening a notification marks it read.
- Use an administrator workspace for report activity and counts, report moderation, and review of disputed claims.
- Optionally upload report images through Cloudinary.
- Use responsive pages with loading, empty, and error states.

## Technology

| Area | Tools |
| --- | --- |
| Frontend | React 19, React Router, Vite 8, Tailwind CSS 4, Axios, Lucide |
| Backend | Node.js, Express 5, Mongoose 9, MongoDB |
| Realtime | Socket.IO 4 |
| Optional image storage | Cloudinary |

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- MongoDB, either local or MongoDB Atlas
- A Cloudinary account only if image uploads are needed

## Run locally

Commands below are for PowerShell from the project root.

1. Create local environment files if they do not already exist:

   ```powershell
   if (-not (Test-Path .\server\.env)) { Copy-Item .\server\.env.example .\server\.env }
   if (-not (Test-Path .\client\.env)) { Copy-Item .\client\.env.example .\client\.env }
   ```

2. Install frontend and backend dependencies:

   ```powershell
   npm --prefix .\server install
   npm --prefix .\client install
   ```

3. Configure `server\.env`. At minimum, set:

   ```dotenv
   CLIENT_URL=http://localhost:5173
   MONGODB_URI=your-mongodb-connection-uri
   JWT_SECRET=replace-with-a-unique-random-secret-at-least-32-characters-long
   ```

   `client\.env` defaults to `VITE_API_URL=http://localhost:5000/api`. Keep database credentials, JWT secrets, and Cloudinary secrets on the server. Never commit `.env` files.

4. Start the API and frontend in separate PowerShell windows, from the project root:

   ```powershell
   # Terminal 1
   npm --prefix .\server run dev
   ```

   ```powershell
   # Terminal 2
   npm --prefix .\client run dev
   ```

   Open the Vite URL shown in the client terminal (normally `http://localhost:5173`). The API listens on port `5000` by default. `GET http://localhost:5000/api/health` checks process health; `/api/health/ready` checks database readiness.

## Environment variables

| Variable | Used by | Required | Description |
| --- | --- | :---: | --- |
| `CLIENT_URL` | Server | Yes | Exact frontend origin allowed by credentialed CORS |
| `MONGODB_URI` | Server | Yes | MongoDB connection URI |
| `JWT_SECRET` | Server | Yes | Unique signing secret, at least 32 characters |
| `NODE_ENV` | Server | No | Runtime mode; production enables Secure cookies |
| `PORT` | Server | No | API port; defaults to `5000` |
| `JWT_EXPIRES_IN` | Server | No | Session duration such as `1d`, `12h`, or `30m`; defaults to `1d` |
| `COOKIE_NAME` | Server | No | Session cookie name; defaults to `findit_token` |
| `CLOUDINARY_CLOUD_NAME` | Server | No | Configure all three Cloudinary values to enable image uploads |
| `CLOUDINARY_API_KEY` | Server | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Server | No | Cloudinary API secret |
| `MAX_IMAGE_SIZE_MB` | Server | No | Maximum image size; defaults to `5` MB |
| `MATCH_THRESHOLD` | Server | No | Minimum suggestion score from `0` to `100`; defaults to `50` |
| `VITE_API_URL` | Client | No | API base URL; defaults to `http://localhost:5000/api` |

Cloudinary settings are optional but must be supplied together. Without them, text reports work and image uploads return a configuration error. The browser derives its Socket.IO endpoint from `VITE_API_URL`.

## Create an administrator

Public registration always creates a regular user. To create an admin account, configure `MONGODB_URI` in `server\.env`, then run this command from the project root in an interactive terminal:

```powershell
npm --prefix .\server run create-admin
```

The script prompts for a name, email, and password and creates the account directly with the admin role. Sign in through the regular login page. Do not share the admin password or database URI.

## Database migration

If the database contains claims from the earlier claim workflow, run the migration once after deploying the updated backend:

```powershell
npm --prefix .\server run migrate-claim-workflow
```

The migration maps older claim statuses, preserves history, associates legacy completed claims with recovered reports, and installs the one-claim-per-person/report constraint. Back up production data first. If duplicate claims exist for one person and report, the migration stops without changing those claim records; review them before retrying.

## Checks

Run from the project root:

```powershell
npm --prefix .\server test
npm --prefix .\client run lint
npm --prefix .\client run build
```

Automated tests do not connect to or modify a real database. Test a deployed environment separately for Atlas connectivity, browser behavior, realtime reconnects, and Cloudinary uploads.

## Matching model

The 100-point suggestion score weights category (24), item name (24), description (15), color (10), location (15), and date (12). Text factors use normalized token Jaccard similarity; date similarity declines linearly to zero at 90 days. Missing factors are excluded and the remaining weights are renormalized. A high score only suggests a possible match; people must verify ownership through the claim process.

## Deployment notes

- Set secrets in the hosting provider’s environment configuration, never in source control.
- Set `CLIENT_URL` to the exact deployed frontend origin.
- The API host must support persistent WebSocket or long-polling connections for Socket.IO.
- For separately hosted frontend and API domains, configure HTTPS on both and review cookie `SameSite` settings. The current cookie uses `SameSite=Lax`; a truly cross-site deployment requires a deliberate `SameSite=None; Secure` configuration and browser testing.
- Do not use wildcard CORS with credentialed cookies.
