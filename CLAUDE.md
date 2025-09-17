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

# Type checking (no dedicated linting setup)
npm run check

# Database migrations
npm run db:push
```

## Architecture Overview

This is a full-stack TypeScript application with a warehouse/inventory management system integrated with Shopify.

### Tech Stack
- **Frontend**: React 18 with Vite, TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript, running via tsx in development
- **Database**: PostgreSQL (Neon serverless) with Drizzle ORM
- **Authentication**: Passport.js with local strategy, session-based auth
- **Routing**: Wouter (client), Express (server)
- **State Management**: React Query for server state

### Project Structure

```
/server/              # Backend Express application
  index.ts           # Main server entry, sets up middleware and Vite integration
  routes.ts          # API routes with auth middleware and role-based access
  auth.ts            # Passport authentication setup with scrypt password hashing
  db.ts              # Database connection using Drizzle
  storage.ts         # Data access layer for all database operations
  shopify.ts         # Shopify Admin API integration
  vite.ts            # Vite dev server integration for development

/client/src/         # Frontend React application
  App.tsx            # Main app component with routing and providers
  main.tsx           # Entry point
  /pages/            # Route components (Dashboard, AuthPage, AuditLog, etc.)
  /components/       # Reusable components (Sidebar, TaskCard, StatsCards)
  /components/ui/    # shadcn/ui components
  /hooks/            # Custom hooks (useAuth, useMobile, useToast)
  /lib/              # Utilities (queryClient, protectedRoute)

/shared/             # Shared between frontend and backend
  schema.ts          # Drizzle schema definitions, Zod validation, TypeScript types
```

### Key Architectural Patterns

1. **Authentication Flow**: Session-based auth with Passport. Protected routes check `req.isAuthenticated()` on backend, `ProtectedRoute` component on frontend wraps authenticated pages.

2. **Database Schema**: Uses Drizzle ORM with PostgreSQL. All table definitions and relations in `shared/schema.ts`. Includes enums for roles (SuperAdmin, WarehouseManager, Editor, Auditor) and task statuses (NEW → DONE).

3. **API Pattern**: RESTful APIs under `/api/*` routes. All routes require authentication except `/api/register` and `/api/login`. Role-based middleware for permission checks.

4. **Data Flow**:
   - Frontend uses React Query for data fetching/caching
   - Backend storage layer (`server/storage.ts`) handles all database operations
   - Shared schema ensures type safety across stack

5. **Task Workflow**: Tasks move through 8 status stages with automatic time tracking (lead time, cycle time). Audit log captures all status transitions.

6. **Shopify Integration**: Products can be published to multiple Shopify stores. Mappings tracked in `shopifyProductMappings` table. Uses Shopify Admin API client.

### Environment Requirements

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string (Neon)
- `SESSION_SECRET`: Express session secret
- `PORT`: Server port (defaults to 5000)

### Path Aliases

Vite configured with these aliases:
- `@/`: maps to `client/src/`
- `@shared`: maps to `shared/`
- `@assets`: maps to `attached_assets/`

### Session Storage

Uses `connect-pg-simple` for PostgreSQL session storage in production, `memorystore` as fallback.