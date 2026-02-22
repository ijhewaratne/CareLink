# Neon Serverless Postgres Configuration

## Overview

CareLink uses **Neon Serverless Postgres** as the primary database provider. Neon is specifically chosen for this MVP because:

- **Auto-scaling**: Compute scales to zero when idle (cost optimization)
- **Instant scaling**: Handles sudden traffic spikes without manual intervention
- **Built-in connection pooling**: PgBouncer included at no extra cost
- **PostGIS support**: Full geospatial query capabilities
- **Branching**: Create database branches for testing/development

## Connection Pooling (CRITICAL)

Serverless environments (Cloud Run, Vercel, AWS Lambda) constantly open and close database connections. Without pooling, 100 users opening the app simultaneously will exhaust your database connections and crash the backend.

### The Problem

```
Serverless Function → Opens DB Connection → Closes Connection
                    ↓
100 concurrent users = 100 connections
                    ↓
PostgreSQL default max_connections = 100
                    ↓
DEADLOCK - New connections rejected
```

### The Solution: PgBouncer

PgBouncer maintains a pool of persistent connections and multiplexes client requests:

```
Serverless Functions → PgBouncer → PostgreSQL
     (100 clients)        ↓         (10-20 actual connections)
                    Connection Pool
```

## Configuration

### 1. Get Your Pooled Connection String

In the Neon Console:
1. Go to your project dashboard
2. Click "Connection Details"
3. Select **"Pooled connection"** tab
4. Copy the connection string

**Format:**
```
postgresql://username:password@pooler-host.neon.tech/dbname?pgbouncer=true
```

**Key differences from direct connection:**
- Hostname includes `pooler-` prefix
- Port is `5432` (same)
- Query parameter `?pgbouncer=true` is REQUIRED

### 2. Environment Variables

```bash
# .env.production
# ✅ CORRECT: Use pooled connection string
DATABASE_URL="postgresql://carelink_prod:password@pooler-xxx.neon.tech/carelink?pgbouncer=true"

# ❌ WRONG: Direct connection will cause connection exhaustion
# DATABASE_URL="postgresql://carelink_prod:password@xxx.neon.tech/carelink"
```

### 3. Prisma Configuration

```prisma
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Enable PostGIS extension for geospatial queries
  extensions = [postgis(version: "3.3")]
}
```

### 4. Prisma Client Setup with Connection Pooling

```typescript
// src/prisma/client.ts
import { PrismaClient } from '@prisma/client';

// Connection pooling configuration for serverless
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  // Connection pooling is handled by PgBouncer, no need for additional config
});

// Graceful shutdown for serverless
export const disconnectPrisma = async () => {
  await prisma.$disconnect();
};

export default prisma;
```

## Connection Pool Settings

Neon's PgBouncer uses these default settings:

| Setting | Value | Description |
|---------|-------|-------------|
| `pool_mode` | `transaction` | Connection returned to pool after each transaction |
| `max_client_conn` | `10000` | Maximum client connections allowed |
| `default_pool_size` | `10` | Connections per user/database pair |
| `reserve_pool_size` | `5` | Additional connections for spikes |

### Customizing Pool Size (if needed)

For high-traffic scenarios, contact Neon support to increase:
- `default_pool_size` to 20-50
- `reserve_pool_size` to 10-20

## Monitoring Connection Usage

### Check Active Connections

```sql
-- Run in Neon SQL Editor or psql
SELECT 
    count(*) as active_connections,
    state,
    usename
FROM pg_stat_activity
WHERE datname = 'carelink'
GROUP BY state, usename;
```

### Set Up Alerts

In Neon Console:
1. Go to "Settings" → "Alerts"
2. Set alert for "Connection usage > 80%"
3. Add notification email/Slack webhook

## Testing Connection Pooling

### Load Test Script

```typescript
// scripts/test-connection-pooling.ts
import prisma from '../src/prisma/client';

async function testConnections() {
  const promises = [];
  
  // Simulate 100 concurrent requests
  for (let i = 0; i < 100; i++) {
    promises.push(
      prisma.user.findUnique({ where: { id: 'test-id' } })
    );
  }
  
  const start = Date.now();
  await Promise.all(promises);
  const duration = Date.now() - start;
  
  console.log(`100 queries completed in ${duration}ms`);
  // With pooling: should complete in < 500ms
  // Without pooling: will likely fail with connection errors
}

testConnections();
```

## Migration from Direct Connection

If currently using direct connection:

1. **Update environment variable:**
   ```bash
   # Old
   DATABASE_URL="postgresql://...xxx.neon.tech/carelink"
   
   # New
   DATABASE_URL="postgresql://...pooler-xxx.neon.tech/carelink?pgbouncer=true"
   ```

2. **Deploy and monitor:**
   - Watch connection metrics in Neon dashboard
   - Check application logs for connection errors

3. **Verify pooling is active:**
   ```sql
   SHOW max_connections; -- Should show PgBouncer limit, not PostgreSQL limit
   ```

## Troubleshooting

### Error: "sorry, too many clients already"

**Cause:** Not using pooled connection string

**Fix:**
1. Verify URL includes `pooler-` prefix
2. Verify `?pgbouncer=true` parameter is present
3. Redeploy application

### Error: " prepared statement already exists"

**Cause:** Prisma's prepared statements conflict with PgBouncer

**Fix:** Add `?pgbouncer=true` to connection string (enables prepared statement mode)

### High Connection Latency

**Cause:** Cold start - PgBouncer needs to establish backend connections

**Mitigation:**
- Use Neon "Minimize Cold Starts" feature (keeps compute warm)
- Implement connection warmup in application startup

## Cost Optimization

Neon pricing tiers:

| Tier | Compute | Storage | Best For |
|------|---------|---------|----------|
| Free | 0.25 vCPU | 0.5 GB | Development |
| Launch | 0.5 vCPU | 10 GB | MVP/Early production |
| Scale | Up to 7 vCPU | 200 GB | Growing production |

**Cost-saving tips:**
1. Enable "Auto-suspend" (pauses compute after inactivity)
2. Use read replicas for reporting queries
3. Archive old data to S3 (compliance requirement anyway)

## Related Documentation

- [Neon Documentation](https://neon.tech/docs)
- [PgBouncer Configuration](https://www.pgbouncer.org/config.html)
- [Prisma Connection Management](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)
