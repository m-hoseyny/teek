# Local Host Mappings

This is the quick lookup for Teek local host URLs and host port bindings.

## Canonical Edit Location

- Edit root `.env` (or copy defaults from `.env.sample`).
- Runtime source: `docker-compose.yml`.
- Canonical variable reference: `docs/config.md`.

## Browser-Facing URLs

| URL | Derived From | Used For |
|---|---|---|
| `http://${APP_HOST}:${FRONTEND_HOST_PORT}` | `APP_HOST` + `FRONTEND_HOST_PORT` | Main app URL and Better Auth base URL |
| `http://${APP_HOST}:${BACKEND_HOST_PORT}` | `APP_HOST` + `BACKEND_HOST_PORT` | Frontend `NEXT_PUBLIC_API_URL` target |

Related allowlist variable:

| Variable | Default | Used For |
|---|---|---|
| `BETTER_AUTH_TRUSTED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Better Auth allowed browser origins |

## Host Port Bindings

| Variable | Default | Mapping |
|---|---|---|
| `FRONTEND_HOST_PORT` | `3000` | `${FRONTEND_HOST_PORT}:3000` |
| `BACKEND_HOST_PORT` | `8000` | `${BACKEND_HOST_PORT}:8000` |
| `POSTGRES_HOST_PORT` | `5432` | `${POSTGRES_HOST_PORT}:5432` |
| `REDIS_HOST_PORT` | `6379` | `${REDIS_HOST_PORT}:6379` |

## Validation

After editing mappings:

```bash
docker compose config
```

Then confirm URLs:

- `http://${APP_HOST}:${FRONTEND_HOST_PORT}`
- `http://${APP_HOST}:${BACKEND_HOST_PORT}`
- `http://${APP_HOST}:${BACKEND_HOST_PORT}/docs`
