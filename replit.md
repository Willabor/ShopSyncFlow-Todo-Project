# Overview

This is a product workflow management system built with React frontend and Express backend. The application manages product data entry and task workflows with role-based access control. Users can create products, track tasks through a kanban board interface, and manage notifications. The system supports multiple user roles (SuperAdmin, WarehouseManager, Editor, Auditor) with different permission levels for various operations.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Radix UI components with shadcn/ui design system
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **State Management**: TanStack React Query for server state and caching
- **Routing**: Wouter for client-side routing
- **Authentication**: Context-based auth provider with protected routes

## Backend Architecture
- **Framework**: Express.js with TypeScript running on Node.js
- **Authentication**: Passport.js with local strategy using session-based auth
- **Password Security**: Node.js crypto module with scrypt for password hashing
- **Session Management**: Express sessions with PostgreSQL session store
- **API Design**: RESTful endpoints with role-based middleware protection

## Database Design
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Includes users, products, tasks, audit logs, and notifications tables
- **Enums**: Role-based permissions, task priorities, and status workflows
- **Relations**: Foreign key relationships between users, products, and tasks

## Data Storage
- **Primary Database**: PostgreSQL via Neon serverless
- **Session Storage**: PostgreSQL-backed session store for user sessions
- **Schema Management**: Drizzle migrations with versioned schema changes

## Authentication & Authorization
- **Strategy**: Session-based authentication with Passport.js local strategy
- **Password Security**: Salted and hashed passwords using scrypt algorithm
- **Role-Based Access**: Middleware functions checking user roles for endpoint access
- **Session Management**: Secure session cookies with PostgreSQL persistence

## Task Workflow System
- **Status Pipeline**: 8-stage workflow from NEW to DONE with specific role permissions
- **Kanban Interface**: Visual board showing tasks across different status columns
- **Priority System**: High/medium/low priority levels with visual indicators
- **Assignment System**: Tasks can be assigned to specific users with role validation

# External Dependencies

## Core Framework Dependencies
- **@neondatabase/serverless**: PostgreSQL database connection via Neon
- **drizzle-orm**: TypeScript ORM for database operations
- **express**: Web application framework for Node.js
- **passport**: Authentication middleware with local strategy
- **@tanstack/react-query**: Server state management and caching
- **react**: Frontend framework with hooks and context

## UI and Styling
- **@radix-ui/***: Headless UI components for accessibility
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant styling
- **lucide-react**: Icon library for consistent iconography

## Development Tools
- **vite**: Fast build tool and development server
- **typescript**: Type safety and enhanced developer experience
- **esbuild**: Fast JavaScript bundler for production builds

## Authentication & Security
- **connect-pg-simple**: PostgreSQL session store for Express sessions
- **express-session**: Session middleware for user authentication
- **passport-local**: Username/password authentication strategy

## Utility Libraries
- **date-fns**: Date manipulation and formatting
- **zod**: Runtime type validation and schema parsing
- **wouter**: Lightweight client-side routing