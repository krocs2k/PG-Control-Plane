# pgDB BroadPlane

A comprehensive management platform for PostgreSQL clusters with federation, AI-powered insights, backup management, alerting, and more.

## Features

### Cluster & Node Management
- Full CRUD operations for clusters and nodes
- Topology visualization (Standard, HA, Multi-Region)
- Replication mode configuration (Sync/Async)
- Node lifecycle management (Drain, Maintenance, Online/Offline)

### Failover Orchestration
- Planned, Emergency, and Automated failover types
- Pre-flight checks and step tracking
- Rollback capabilities

### AI-Powered Insights
- Anomaly detection and alerting
- Predictive forecasting with status management
- Optimization recommendations
- ChatOps interface with PostgreSQL DBRE assistant
- QA Copilot for test generation
- Governance & FinOps analysis
- Tech Scout for version recommendations

### Backup & Recovery
- On-demand and scheduled backups (Full/Incremental)
- Point-in-Time Recovery (PITR)
- Backup verification and retention policies

### Alert Management
- Metric-based alert rules
- Multi-channel notifications (Email/Webhook)
- Alert suppression and acknowledgment

### Connection Pooling
- Support for PgBouncer, PgPool, and Odyssey
- Real-time pool statistics
- Connection limit management

### Query Performance Analytics
- Slow query analysis
- Index recommendations
- Query optimization suggestions

### Replication Health
- WAL monitoring
- Replication slot management
- Lag tracking

### Control Plane Federation
- Multi-control-plane clustering
- Principle/Partner role model
- Automatic data synchronization
- Promotion request with timeout handling

### User Administration
- MFA support (TOTP)
- Session management
- Login history tracking
- Role-based access control

### Dynamic Connection Endpoints
- Per-cluster connection string generation
- Multiple endpoint modes (READ_WRITE, READ_ONLY, WRITE_ONLY, BALANCED)
- Dynamic domain detection

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **UI**: Tailwind CSS, Radix UI, Framer Motion
- **AI**: Abacus AI LLM APIs

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Yarn package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/PG-Control-Plane.git
cd PG-Control-Plane

# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL and other settings

# Generate Prisma client
yarn prisma generate

# Run database migrations
yarn prisma db push

# Seed the database (optional)
yarn prisma db seed

# Start development server
yarn dev
```

### Docker Deployment

```bash
# Build the Docker image
docker build -t pg-control-plane .

# Run the container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e NEXTAUTH_SECRET="your-secret" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  pg-control-plane
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| DATABASE_URL | PostgreSQL connection string | Yes |
| NEXTAUTH_SECRET | Secret for NextAuth.js | Yes |
| NEXTAUTH_URL | Base URL of the application | Yes |
| ABACUSAI_API_KEY | API key for AI features | No |

## API Endpoints

### Health Check
- `GET /api/health` - Service health status

### Authentication
- `POST /api/auth/[...nextauth]` - NextAuth.js endpoints
- `POST /api/signup` - User registration

### Resources
- `/api/organizations` - Organization management
- `/api/projects` - Project CRUD
- `/api/clusters` - Cluster management
- `/api/nodes` - Node operations
- `/api/backups` - Backup management
- `/api/alerts` - Alert rules and management
- `/api/connection-pools` - Pool configuration
- `/api/connection-endpoints` - Dynamic endpoints
- `/api/failover` - Failover orchestration
- `/api/routing` - Traffic routing
- `/api/node-lifecycle` - Node lifecycle events

### AI Features
- `/api/ai/anomalies` - Anomaly detection
- `/api/ai/forecasts` - Predictive forecasting
- `/api/ai/recommendations` - Optimization suggestions
- `/api/ai/chat` - ChatOps interface
- `/api/ai/reports` - Report generation
- `/api/ai/qa` - QA Copilot
- `/api/ai/governance` - Compliance scanning
- `/api/ai/tech-scout` - Technology insights

### Administration
- `/api/admin/users` - User management
- `/api/admin/federation` - Control plane federation
- `/api/admin/federation/sync` - Data synchronization

## License

MIT
