# ShopSyncFlow

> Multi-tenant SaaS platform for Shopify store workflow management with AI-powered content generation, collection health monitoring, and automated product publishing.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Shopify](https://img.shields.io/badge/Shopify-7AB55C?style=for-the-badge&logo=shopify&logoColor=white)](https://shopify.dev/)

## Overview

ShopSyncFlow is a comprehensive product information management (PIM) and workflow system designed for Shopify merchants. It handles the complete product lifecycle from creation through publishing with:

- **AI Content Studio** - Generate SEO-optimized product descriptions, titles, and bullet points using Google Gemini
- **Shopify Sync** - Bi-directional product, variant, and collection synchronization
- **Collection Health** - Detect duplicate collections, navigation conflicts, and orphaned links
- **Brand Enrichment** - Automatically scrape vendor websites for size charts and product details
- **Workflow Management** - 8-stage task pipeline with SLA monitoring and role-based access
- **Multi-Tenant** - Full tenant isolation for SaaS deployment

## Key Features

| Feature | Description |
|---------|-------------|
| **Content Studio** | AI-powered product content generation with Yoast SEO scoring |
| **Product Management** | Full CRUD with variants (3 options), images, and Shopify taxonomy |
| **Collection Health** | Duplicate detection, nav conflict analysis, education center |
| **Brand Scraping** | Size charts, descriptions, and product data from vendor sites |
| **Variant Editor** | Bulk editing, QuickBooks import, auto-generation |
| **File Management** | Centralized media library with product/variant associations |
| **Weight Rules** | Automated weight assignment by category |
| **Task Workflow** | Kanban board with SLA tracking and audit logging |

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 16+ (or Docker with `postgres16` container)
- npm or pnpm

### Installation

```bash
# Clone repository
git clone https://github.com/Willabor/ShopSyncFlow-Todo-Project.git
cd ShopSyncFlow-Todo-Project

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database and API credentials

# Push database schema
npm run db:push

# Start development server
npm run dev
```

Open http://localhost:5000

### Docker Deployment

```bash
# Build and start (connects to postgres16 container)
docker-compose up -d --build

# View logs
docker logs shopsyncflow-app -f
```

Application runs on port **6002** (mapped to container port 5000).

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| **Backend** | Express.js + TypeScript |
| **Database** | PostgreSQL 16 + Drizzle ORM |
| **Authentication** | Passport.js (session-based, scrypt hashing) |
| **State** | React Query (TanStack Query v5) |
| **AI** | Google Gemini |
| **Integrations** | Shopify Admin API, Google Ads API, Google Trends |

## Project Structure

```
ShopSyncFlow-Todo-Project/
├── client/src/
│   ├── pages/              # 30+ page components
│   │   ├── content-studio.tsx    # AI content generation
│   │   ├── product-edit.tsx      # Product editor
│   │   ├── collections.tsx       # Collection management
│   │   ├── collection-health.tsx # Health dashboard
│   │   ├── vendors.tsx           # Brand management
│   │   └── ...
│   ├── components/         # UI components
│   │   ├── variants/       # Variant editor (20+ components)
│   │   ├── files/          # File management
│   │   └── ui/             # shadcn/ui (50+ components)
│   ├── hooks/              # useAuth, useProductEnrichment, etc.
│   ├── contexts/           # System, Sync, Notification contexts
│   └── lib/                # Utilities
├── server/
│   ├── routes.ts           # API routes (~300KB)
│   ├── storage.ts          # Data access layer (~172KB)
│   ├── shopify.ts          # Shopify API client (~85KB)
│   ├── services/           # 30+ business logic services
│   │   ├── gemini-content.service.ts
│   │   ├── shopify-import.service.ts
│   │   ├── collections-analyzer-v2.service.ts
│   │   └── ...
│   ├── routes/             # Modular route handlers
│   └── health/             # Collection health monitoring
├── shared/
│   └── schema.ts           # Drizzle schema + Zod validation
├── migrations/             # Database migrations
├── e2e/                    # Playwright E2E tests
└── docker-compose.yml      # Docker deployment
```

## Database Schema

~60 tables organized by domain:

**Multi-Tenant Core:** `tenants`, `users`, `session`

**Product Management:** `products`, `productOptions`, `productVariants`, `vendors`, `categories`, `tags`, `collections`, `productCollections`

**Shopify Sync:** `shopifyProducts`, `shopifyProductVariants`, `shopifyProductImages`, `shopifySyncLog`, `shopifySyncErrors`

**Workflow:** `tasks`, `taskSteps`, `stepTemplates`, `auditLog`, `notifications`

**Collection Health:** `collectionHealthIssues`, `navigationMenus`, `navigationItems`, `educationArticles`, `appEducationLibrary`

**Brand Enrichment:** `brandSizeCharts`, `brandProductCache`, `styleNumberMappings`

**Files:** `files`, `productMedia`, `variantMedia`, `fileReferences`

## Workflow States

```
NEW → TRIAGE → ASSIGNED → IN_PROGRESS → READY_FOR_REVIEW → PUBLISHED → QA_APPROVED → DONE
```

- **Auto-return**: Tasks in ASSIGNED >2 days return to TRIAGE
- **SLA tracking**: 48-hour default with breach alerts
- **Time tracking**: Lead time and cycle time calculated automatically

## User Roles

| Role | Permissions |
|------|-------------|
| **SuperAdmin** | Full access, user management, system configuration |
| **WarehouseManager** | Inventory, warehouse tasks, product dimensions |
| **Editor** | Product content, images, draft management |
| **Auditor** | Read-only, quality checklists, compliance |

## Available Scripts

```bash
# Development
npm run dev              # Start dev server (frontend + backend)
npm run build            # Build for production
npm run start            # Start production server
npm run check            # TypeScript type checking

# Database
npm run db:push          # Push schema changes (no migrations)

# Testing
npm run test             # Unit tests (Vitest)
npm run test:e2e         # E2E tests (Playwright)
npm run test:e2e:headed  # E2E with visible browser

# Migrations
npm run migrate:categories           # Run category migration
npm run migrate:categories:dry-run   # Preview changes
npm run migrate:categories:rollback  # Revert

# Google Ads
npm run auth:google-ads  # OAuth setup
npm run test:google-ads  # Test connection
```

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@postgres16:5432/shopsyncflow_db
SESSION_SECRET=your_secret

# Shopify
SHOPIFY_STORE_URL=https://your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx

# AI (Gemini)
GEMINI_API_KEY=your_key
SCRAPER_AI_ENABLED=1

# Optional: Google Ads
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_REFRESH_TOKEN=

# Optional: Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

See `.env.example` for full configuration options.

## API Overview

All routes under `/api/*` require authentication except:
- `GET /health` - Health check
- `POST /api/auth/register/*` - Tenant registration

Key endpoints:
- `GET/POST /api/products` - Product CRUD
- `GET/POST /api/tasks` - Task management
- `POST /api/shopify/sync` - Trigger Shopify sync
- `GET /api/collections/health` - Collection health issues
- `POST /api/ai/generate-content` - AI content generation
- `POST /api/vendors/:id/enrich` - Brand website scraping

## Deployment

### Docker (Recommended)

```bash
docker-compose up -d --build
```

Connects to `postgres_default` network for PostgreSQL access.

### Manual

```bash
npm run build
NODE_ENV=production npm run start
```

## Current Status

| Component | Status |
|-----------|--------|
| Database Schema | Complete (40+ tables) |
| Authentication | Complete (session + 2FA ready) |
| API Layer | Complete (~200 endpoints) |
| Product Management | Complete |
| Variant System | Complete |
| Shopify Sync | Complete |
| Content Studio | Complete |
| Collection Health | Complete |
| Brand Enrichment | Complete |
| File Management | Complete |
| Weight Rules | Complete |
| E2E Tests | In Progress |

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Last Updated**: December 2025
**Maintainer**: [@Willabor](https://github.com/Willabor)
