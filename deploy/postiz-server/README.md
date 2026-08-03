# Postiz server deployment

This deployment runs OpenReply beside an existing Postiz installation without
creating duplicate PostgreSQL or Redis containers.

## Isolation model

- OpenReply has its own PostgreSQL database and login role.
- OpenReply uses Redis database `1`; Postiz continues using its existing Redis
  namespace.
- Both OpenReply containers join the private `postiz_postiz-network` Docker
  network.
- Only the web app is published, on `127.0.0.1:4010`. Caddy terminates TLS and
  proxies the public OpenReply hostname to this loopback port.
- PostgreSQL, Redis, and the worker are never published on a host port.

## Required local file

Create `deploy/postiz-server/.env.production` on the server. It is ignored by
Git and must contain the environment variables documented in
[`docs/setup.md`](../../docs/setup.md#environment-variables). Use these internal
service addresses:

```dotenv
DATABASE_URL=postgresql://openreply:<password>@postiz-postgres:5432/openreply
REDIS_URL=redis://postiz-redis:6379/1
```

Set `OPENREPLY_IMAGE_TAG` in the shell or in a separate Compose `.env` file to
the exact Git commit being deployed.

## Deploy

From the repository root:

```bash
docker compose --project-directory deploy/postiz-server \
  -f deploy/postiz-server/compose.yml build

docker compose --project-directory deploy/postiz-server \
  -f deploy/postiz-server/compose.yml run --rm openreply-web npm run db:migrate

docker compose --project-directory deploy/postiz-server \
  -f deploy/postiz-server/compose.yml up -d
```

After both processes are running, `/api/health` must return `status: ok` and a
healthy worker heartbeat.
