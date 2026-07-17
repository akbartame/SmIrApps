# SmIr

```
smir-app/
  backend/    Node.js — MQTT ingest, REST API, WebSocket push, Parquet archiver
  frontend/   Vite + React — live monitoring dashboard
  docker-compose.yml
```

See `backend/README.md` and `frontend/README.md` for what each service does
and their known gaps/assumptions.

## Run with Docker

```bash
docker compose up --build
```

- Backend: `http://localhost:3000` (REST + `/ws`)
- Frontend: `http://localhost:8080` (nginx, proxies `/api` and `/ws` to the backend container)

**Not verified end-to-end.** This sandbox has no `docker` binary and no
network, so neither Dockerfile has actually been built and neither
container has actually run. The compose YAML parses correctly and both
Dockerfiles follow a standard pattern for their runtimes (Node + native
addon for the backend, Node build → nginx static serve for the frontend),
but "should work" is not the same as "confirmed working" — build it locally
before relying on it.

Two things about the setup worth knowing rather than discovering later:

- `better-sqlite3` in `backend/Dockerfile` needs `python3 make g++` to
  compile its native addon if no prebuilt binary matches your target
  platform — that's why the backend build is two stages (toolchain in the
  `deps` stage, stripped out of the final image).
- The frontend's `/api` and `/ws` calls stay relative on purpose (see
  `frontend/src/lib/config.ts`) so the exact same code works against the
  Vite dev-server proxy locally and against nginx's reverse proxy in
  `frontend/nginx.conf` in Docker — no `VITE_API_URL`/`VITE_WS_URL` build
  args needed for the compose setup as written.

## Run without Docker

See the "Setup" section in each service's own README.

## Monthly archiver

Not a long-running service — see the comment at the bottom of
`docker-compose.yml` for how to run or schedule it.
