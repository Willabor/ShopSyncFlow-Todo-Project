# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start development server (runs both frontend and backend)
npm run dev

# Build for production (builds frontend with Vite and backend with esbuild)
npm run build

# Start production server
npm run start

# Type checking
npm run check

# Database schema push (WARNING: no migrations, direct schema changes)
npm run db:push

# Category migration scripts
npm run migrate:categories           # Run migration
npm run migrate:categories:dry-run   # Preview changes
npm run migrate:categories:rollback  # Revert migration

# Testing
npm run test                  # Unit tests (Vitest)
npm run test:ui               # Vitest UI
npm run test:coverage         # Coverage report
npm run test:e2e              # Playwright E2E tests
npm run test:e2e:headed       # E2E with browser visible
npm run test:e2e:debug        # E2E debug mode

# Google Ads integration
npm run auth:google-ads       # OAuth token setup
npm run test:google-ads       # Test connection
```

## Architecture Overview

Multi-tenant SaaS platform for Shopify store workflow management. Handles product lifecycle from creation through Shopify publishing with role-based access, SLA monitoring, AI content generation, and collection health monitoring.

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| **Backend** | Express.js + TypeScript (tsx in dev, esbuild for prod) |
| **Database** | PostgreSQL 16 (local `postgres16` container) via Drizzle ORM |
| **Authentication** | Passport.js with local strategy, session-based (scrypt hashing) |
| **State** | React Query (TanStack Query v5) |
| **Routing** | Wouter (client) / Express (server) |
| **AI** | Google Gemini (content generation, brand scraping) |
| **Integrations** | Shopify Admin API, Google Ads API, Google Trends |

### Project Structure

```
/server/                    # Backend Express application
  index.ts                 # Server entry, middleware setup, Vite integration
  routes.ts                # Main API routes (~300KB, role-based access)
  auth.ts                  # Passport auth with scrypt, 2FA support
  db.ts                    # Drizzle database connection
  storage.ts               # Data access layer (~172KB, all DB operations)
  shopify.ts               # Shopify Admin API client (~85KB)
  sync-progress.ts         # WebSocket sync progress tracking
  ruleEvaluator.ts         # Smart collection rule evaluation
  qb-import-helpers.ts     # QuickBooks import parsing
  /services/               # Business logic services
    gemini-content.service.ts          # AI content generation (~80KB)
    shopify-import.service.ts          # Shopify product sync (~67KB)
    shopify-publish.service.ts         # Publish to Shopify
    collections-analyzer-v2.service.ts # Collection health analysis
    generic-brand-scraper.service.ts   # Brand website scraping
    headless-brand-scraper.service.ts  # Puppeteer-based scraping
    size-chart-ai-analyzer.service.ts  # AI size chart extraction
    bullet-point-generator.service.ts  # SEO bullet points
    category-recommendation.service.ts # AI category suggestions
    file-storage.service.ts            # File upload handling
    email.ts                           # Nodemailer email service
    google-ads-keyword.service.ts      # Google Ads keyword data
    google-trends.service.ts           # Google Trends integration
    yoast-analysis.service.ts          # SEO scoring
  /routes/                 # Modular route handlers
    brand-enrichment.ts    # Brand scraping endpoints
    files.routes.ts        # File upload/management
    weight-rules.ts        # Weight category rules
    integrations.ts        # OAuth flows (Google Ads)
    register.ts            # Tenant self-registration
  /health/                 # Collection health monitoring
  /utils/                  # Utilities (handleGenerator, etc.)

/client/src/               # Frontend React application
  App.tsx                  # Main app with routing and providers
  main.tsx                 # Entry point
  /pages/                  # 30+ page components
    content-studio.tsx     # AI content generation (~124KB)
    product-edit.tsx       # Product editor (~89KB)
    weight-rules.tsx       # Weight management (~83KB)
    collections.tsx        # Collection management (~66KB)
    categories.tsx         # Category management (~65KB)
    collection-health.tsx  # Health dashboard (~55KB)
    products.tsx           # Product list (~38KB)
    settings.tsx           # App settings
    vendors.tsx            # Vendor/brand management
    files.tsx              # File browser
    tags.tsx               # Tag management
    navigation.tsx         # Nav menu editor
    education.tsx          # Education center
    kanban-board.tsx       # Task kanban view
    ...
  /components/             # Reusable components
    /variants/             # Variant management UI (20+ components)
    /files/                # File upload/picker components
    /ui/                   # shadcn/ui components (50+)
    task-card.tsx, task-form.tsx, stats-cards.tsx, etc.
  /hooks/                  # Custom React hooks
    use-auth.tsx           # Auth context and hooks
    use-product-enrichment.ts  # Brand scraping workflow
    use-health-check.ts    # Collection health polling
    use-navigation.ts      # Navigation menu state
    useSyncProgress.ts     # WebSocket sync progress
  /contexts/               # React contexts
    SystemContext.tsx      # System time/timezone
    SyncContext.tsx        # Shopify sync state
    NotificationContext.tsx # Global notifications
  /lib/                    # Utilities
    queryClient.ts         # React Query setup
    protected-route.tsx    # Auth route wrapper

/shared/                   # Shared between frontend and backend
  schema.ts                # Drizzle schema + Zod validation (~2600 lines)

/migrations/               # Database migrations
/scripts/                  # Utility scripts
/e2e/                      # Playwright E2E tests
/attached_assets/          # Static assets (size charts, etc.)
```

### Database Schema (~60 tables)

**Multi-Tenant Core:**
- `tenants` - Company accounts with Shopify/Google Ads config
- `users` - 4 roles: SuperAdmin, WarehouseManager, Editor, Auditor
- `session` - PostgreSQL session storage

**Product Management:**
- `products` - Local products with SEO fields, AI content, Shopify links
- `productOptions` - Variant options (Size, Color, Material - max 3)
- `productVariants` - Individual SKUs with pricing/inventory
- `vendors` - Brands with website scraping config
- `categories` - Product categories with Shopify taxonomy mapping
- `tags` - Product tags
- `collections` - Shopify collection sync with health tracking
- `productCollections` - Many-to-many product↔collection

**Shopify Integration:**
- `shopifyProducts` - Synced Shopify products
- `shopifyProductVariants` - Synced variants
- `shopifyProductImages` - Product media
- `shopifySyncLog` - Sync operation history
- `shopifySyncErrors` - Detailed error tracking
- `shopifyProductMappings` - Multi-store product links

**Workflow System:**
- `tasks` - Workflow items (8-stage pipeline)
- `taskSteps` - Checklist items per task
- `stepTemplates` - Reusable step definitions
- `auditLog` - Status transition history
- `notifications` - User/tenant notifications

**Collection Health:**
- `collectionHealthIssues` - Detected problems
- `navigationMenus` - Synced Shopify nav menus
- `navigationItems` - Menu items
- `educationArticles` - Help content
- `appEducationLibrary` - Known Shopify apps
- `tenantDetectedApps` - Apps detected per tenant

**Brand Enrichment:**
- `brandSizeCharts` - Cached size charts by brand/category
- `brandProductCache` - Scraped product data
- `styleNumberMappings` - SKU↔brand product mappings

**Files System:**
- `files` - Uploaded file metadata
- `productMedia` - Product↔file links
- `variantMedia` - Variant↔file links
- `fileReferences` - Generic file usage tracking

### Task Workflow States

```
NEW → TRIAGE → ASSIGNED → IN_PROGRESS → READY_FOR_REVIEW → PUBLISHED → QA_APPROVED → DONE
```

- Auto-return: Tasks in ASSIGNED for >2 days return to TRIAGE
- SLA tracking: 48-hour default deadline with breach alerts
- Time tracking: Lead time and cycle time calculated automatically

### Key Features

1. **Content Studio** - AI-powered product content generation with Gemini
2. **Shopify Sync** - Bi-directional product/collection/variant sync
3. **Collection Health** - Duplicate detection, nav conflict analysis
4. **Brand Enrichment** - Website scraping for size charts, descriptions
5. **Variant Management** - Full option/variant editing with QB import
6. **File Management** - Centralized media library
7. **Weight Rules** - Automated weight assignment by category

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://shopsyncflow_user:YOUR_PASSWORD_HERE@postgres16:5432/shopsyncflow_db
SESSION_SECRET=your_session_secret

# Server
PORT=5000
NODE_ENV=development|production
APP_URL=http://localhost:5000
APP_DOMAIN=tasks.nexusdenim.com

# Shopify Integration
SHOPIFY_STORE_URL=https://your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx

# AI Content Generation (Gemini)
GEMINI_API_KEY=your_gemini_api_key
SCRAPER_AI_ENABLED=1

# Google Ads (optional)
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=
FROM_NAME=ShopSyncFlow

# Scraping Configuration
SCRAPER_HEADLESS_ENABLED=1
SCRAPER_RESPECT_ROBOTS_TXT=1
SCRAPER_MIN_DELAY_MS=2000
PUPPETEER_SERVICE_ENABLED=0
PUPPETEER_SERVICE_URL=http://localhost:7000
```

### Docker Deployment

```bash
# Build and start
docker-compose up -d --build

# View logs
docker logs shopsyncflow-app -f

# Stop
docker-compose down
```

**Container Details:**
- Port: 6002 (host) → 5000 (container)
- Network: `postgres_default` (connects to postgres16)
- Volumes: `./server/uploads`, `./logs`

### Path Aliases (Vite)

- `@/` → `client/src/`
- `@shared` → `shared/`
- `@assets` → `attached_assets/`

### API Patterns

- All routes under `/api/*` require authentication except:
  - `POST /api/auth/register/*` - Tenant registration flow
  - `GET /health` - Health check
- Role-based middleware: `requireRole(["SuperAdmin", "WarehouseManager"])`
- Multi-tenant isolation via `getTenantId(req)` helper
- Rate limiting on registration endpoints

### Important Notes

1. **No Migrations**: Uses `drizzle-kit push` directly - risky for production data
2. **Large Files**: `routes.ts` (~300KB) and `storage.ts` (~172KB) are massive
3. **Multi-Tenant**: All queries must include tenant isolation
4. **Session Storage**: Uses `connect-pg-simple` for PostgreSQL sessions
5. **Migrated from Neon**: Database moved to local postgres16 (Oct 2025)

### Testing

```bash
# Unit tests
npm run test

# E2E tests (Playwright)
npm run test:e2e

# Docker-based E2E
npm run test:e2e:docker
```

### Common Tasks

**Add new API endpoint:**
1. Add route in `server/routes.ts` with `requireAuth` middleware
2. Add storage method in `server/storage.ts`
3. Include tenant isolation with `getTenantId(req)`

**Add new page:**
1. Create component in `client/src/pages/`
2. Add route in `client/src/App.tsx` with `<ProtectedRoute>`
3. Add navigation link in sidebar component

**Shopify sync issues:**
1. Check `shopifySyncLog` table for errors
2. Review `shopifySyncErrors` for detailed diagnostics
3. Use `/api/shopify/sync/debug` endpoint
