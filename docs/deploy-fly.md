# Fly.io Deployment (quick demo)

This repo deploys as three Fly apps:
- A2A agent (API + SSE)
- MCP server (tools + SSE)
- Web UI (Next.js)

## 1) Create apps (from repo root)
```bash
flyctl auth login

flyctl apps create ui-morn-a2a
flyctl apps create ui-morn-mcp
flyctl apps create ui-morn-web
```

If you use different names, update them in:
- `deploy/fly/a2a.toml`
- `deploy/fly/mcp.toml`
- `deploy/fly/web.toml`

## 2) Set secrets and CORS
```bash
flyctl secrets set -a ui-morn-a2a \
  OPENROUTER_API_KEY="YOUR_KEY" \
  Mcp__BaseUrl="https://ui-morn-mcp.fly.dev" \
  CORS_ALLOWED_ORIGINS="https://ui-morn-web.fly.dev"

flyctl secrets set -a ui-morn-mcp \
  CORS_ALLOWED_ORIGINS="https://ui-morn-web.fly.dev"
```

If you do not want OpenRouter, omit `OPENROUTER_API_KEY`.

## 3) Set UI build args
Edit `deploy/fly/web.toml` and update:
```toml
[build.args]
  NEXT_PUBLIC_A2A_BASE_URL = "https://ui-morn-a2a.fly.dev"
  NEXT_PUBLIC_MCP_BASE_URL = "https://ui-morn-mcp.fly.dev"
```

## 4) Deploy (from repo root)
```bash
flyctl deploy -c deploy/fly/a2a.toml
flyctl deploy -c deploy/fly/mcp.toml
flyctl deploy -c deploy/fly/web.toml
```

## 5) Verify
- UI: `https://ui-morn-web.fly.dev`
- A2A API: `https://ui-morn-a2a.fly.dev/.well-known/agent-card.json`
- MCP API: `https://ui-morn-mcp.fly.dev/mcp`

## Notes
- `CORS_ALLOWED_ORIGINS` is required in Production so the browser can call the APIs.
- A2A calls MCP via `Mcp__BaseUrl`; update if you rename the MCP app.
