# Focus & Flow — ADHD Coaching Mastery Program

A fully interactive web app for ADHD coaches built on Cloudflare's serverless stack.

## Features

- **User Authentication** — Secure sign up/login with JWT tokens
- **Progress Tracking** — Track completion across 16 modules
- **Persistent Storage** — Save scenario responses and reflections to D1 database
- **Reading List** — Mark books as read with progress sync
- **Auto-save** — Reflections auto-save after 2 seconds of inactivity
- **Sync Status** — Visual feedback when data is being saved
- **Responsive Design** — Works on desktop and mobile

## Tech Stack

- **Cloudflare Pages** — Hosting and deployment
- **Cloudflare Workers** — Serverless API functions
- **Cloudflare D1** — SQLite database for user data
- **Vanilla JS** — No framework dependencies

## Project Structure

```
coaching-curriculum/
├── functions/
│   └── api/
│       └── [[path]].js      # API routes (auth, progress, responses)
├── migrations/
│   └── 001_init.sql         # Database schema
├── public/
│   └── index.html           # Frontend application
├── package.json
└── wrangler.toml            # Cloudflare configuration
```

## Getting Started

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI installed globally: `npm install -g wrangler`

### 1. Install Dependencies

```bash
npm install
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

### 3. Create D1 Database

```bash
npm run db:create
```

This will output a database ID. Copy it and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "COACHING_DB"
database_name = "coaching-db"
database_id = "YOUR_DATABASE_ID_HERE"  # ← Paste the ID here
```

### 4. Update JWT Secret

In `wrangler.toml`, change the JWT secret to a secure random string:

```toml
[vars]
JWT_SECRET = "your-super-secret-jwt-key-change-in-production"
```

### 5. Apply Database Migrations

**Local development:**
```bash
npm run db:migrate
```

**Production:**
```bash
npm run db:migrate:prod
```

### 6. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:8788`

### 7. Deploy to Production

```bash
npm run deploy
```

Your app will be deployed to Cloudflare Pages and available at a `*.pages.dev` URL.

## API Endpoints

All endpoints are prefixed with `/api/`

### Authentication
- `POST /api/auth/register` — Create new account
- `POST /api/auth/login` — Sign in
- `GET /api/auth/me` — Get current user

### Progress
- `GET /api/progress` — Get module completion status
- `POST /api/progress` — Update module completion

### Scenario Responses
- `GET /api/responses/scenario/:moduleId` — Get saved response
- `POST /api/responses/scenario` — Save scenario response

### Reflection Responses
- `GET /api/responses/reflection/:moduleId` — Get all reflections for module
- `POST /api/responses/reflection` — Save a reflection response

### Reading Progress
- `GET /api/reading/:moduleId` — Get reading progress for module
- `POST /api/reading` — Update reading progress

### Bulk Data
- `GET /api/all-data` — Get all user data in one request

## Database Schema

### Tables

**users**
- `id` — Primary key (UUID)
- `email` — Unique email address
- `password_hash` — SHA-256 hash
- `name` — Optional display name
- `created_at`, `updated_at` — Timestamps

**user_progress**
- `id` — Primary key (UUID)
- `user_id` — Foreign key to users
- `module_id` — Module identifier (e.g., "m1")
- `completed` — Boolean
- `completed_at` — Timestamp

**scenario_responses**
- `id` — Primary key (UUID)
- `user_id` — Foreign key to users
- `module_id` — Module identifier
- `response_text` — User's written response

**reflection_responses**
- `id` — Primary key (UUID)
- `user_id` — Foreign key to users
- `module_id` — Module identifier
- `prompt_number` — Which reflection prompt (1, 2, 3...)
- `response_text` — User's written response

**reading_progress**
- `id` — Primary key (UUID)
- `user_id` — Foreign key to users
- `module_id` — Module identifier
- `book_title` — Book title
- `is_read` — Boolean

## Security Notes

⚠️ **Important for Production:**

1. The current password hashing uses SHA-256. For production, consider upgrading to bcrypt.
2. Store the JWT_SECRET in Cloudflare Pages environment variables, not in `wrangler.toml`.
3. Consider adding rate limiting to auth endpoints.
4. Add HTTPS-only cookies for production.

## Customization

### Adding New Modules

1. Update the `stubModules` array in `public/index.html`
2. Add corresponding HTML for the module view
3. Database schema supports any module ID

### Styling

All CSS variables are defined in `:root` at the top of the stylesheet. Key colors:

```css
--navy: #0f1f38;      /* Primary dark */
--gold: #c9a84c;      /* Accent */
--sage: #6b8f71;      /* Success/completion */
--rust: #b05d3a;      /* Error/alert */
```

## Troubleshooting

**Database errors:**
```bash
# Check database status
wrangler d1 info coaching-db

# Re-apply migrations
wrangler d1 migrations apply coaching-db --remote
```

**Function errors:**
```bash
# Check deployment logs
wrangler pages deployment list

# Tail logs (production)
wrangler tail
```

**Local development issues:**
```bash
# Clear Wrangler cache
wrangler --clear-cache

# Re-login
wrangler logout && wrangler login
```

## License

MIT

---

Built with ❤️ for ADHD coaches everywhere.
