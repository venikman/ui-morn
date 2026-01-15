import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const paths = {
  a2a: "deploy/fly/a2a.toml",
  mcp: "deploy/fly/mcp.toml",
  web: "deploy/fly/web.toml",
};

const attempts = Number(process.env.SMOKE_ATTEMPTS ?? "30");
const delayMs = Number(process.env.SMOKE_DELAY_MS ?? "5000");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "15000");

function readAppName(path: string): string {
  const content = readFileSync(path, "utf8");
  const match = content.match(/^\s*app\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`Unable to read app name from ${path}`);
  }
  return match[1];
}

async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function check(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  for (let i = 1; i <= attempts; i += 1) {
    console.log(`Checking ${name} (attempt ${i}/${attempts})...`);
    try {
      await fn();
      console.log(`${name} ok`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${name} attempt ${i} failed: ${message}`);
    }
    if (i < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(`${name} failed after ${attempts} attempts`);
}

async function main(): Promise<void> {
  const a2aApp = process.env.A2A_APP ?? readAppName(paths.a2a);
  const mcpApp = process.env.MCP_APP ?? readAppName(paths.mcp);
  const webApp = process.env.WEB_APP ?? readAppName(paths.web);

  const a2aUrl = `https://${a2aApp}.fly.dev/.well-known/agent-card.json`;
  const mcpUrl = `https://${mcpApp}.fly.dev/mcp`;
  const webUrl = `https://${webApp}.fly.dev`;

  await check("A2A", async () => {
    const response = await fetchWithTimeout(a2aUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  });

  await check("MCP", async () => {
    const response = await fetchWithTimeout(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "smoke",
        method: "tools/list",
        params: {},
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(`RPC error: ${payload.error.message ?? "unknown"}`);
    }
    if (payload?.jsonrpc !== "2.0") {
      throw new Error("Invalid JSON-RPC response");
    }
  });

  await check("Web", async () => {
    const response = await fetchWithTimeout(webUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  });
}

await main();
