#!/bin/sh
set -eu
# Existing credentials stay inside the web container; nothing secret is put on argv.
exec docker exec -i postiz-server-openreply-web-1 node --input-type=module - <<'JAVASCRIPT'
const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
if (!secret) { console.error("OpenReply renewal: missing configured cron authentication"); process.exit(1); }
try {
  const response = await fetch("http://127.0.0.1:3000/api/cron/refresh-tokens", {
    headers: { authorization: `Bearer ${secret}` },
    redirect: "error",
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.json();
  const results = body?.data?.results ?? [];
  const failed = results.filter(result => result.status === "failed").length;
  console.log(JSON.stringify({ at: new Date().toISOString(), status: response.status,
    processed: body?.data?.totalProcessed ?? 0,
    refreshed: results.filter(result => result.status === "refreshed").length, failed }));
  if (!response.ok || body?.success !== true || failed > 0) process.exitCode = 1;
} catch (error) {
  console.error("OpenReply renewal request failed:", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
}
JAVASCRIPT
