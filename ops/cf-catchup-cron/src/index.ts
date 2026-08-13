/**
 * Cloudflare Worker — wake Catch-up watchdog via workflow_dispatch.
 * Breaks the GitHub Actions `schedule` SPOF (primary + catch-up both use GHA cron).
 *
 * Secrets (wrangler secret put):
 *   GITHUB_TOKEN  — PAT with `actions:write` (fine-grained) or classic `repo`+`workflow`
 *   GITHUB_REPO   — optional, default spring79y/stockbench
 *
 * Deploy:
 *   cd ops/cf-catchup-cron && npx wrangler deploy
 */
const DEFAULT_REPO = "spring79y/stockbench";
const WORKFLOW_FILE = "catchup-watchdog.yml";

type Env = {
  GITHUB_TOKEN: string;
  GITHUB_REPO?: string;
};

async function dispatchCatchUp(env: Env): Promise<Response> {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    return Response.json({ ok: false, error: "GITHUB_TOKEN missing" }, { status: 500 });
  }
  const repo = (env.GITHUB_REPO || DEFAULT_REPO).replace(/^\/+|\/+$/g, "");
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "stockbench-cf-catchup-cron",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (res.status === 204) {
    return Response.json({
      ok: true,
      dispatched: WORKFLOW_FILE,
      repo,
      at: new Date().toISOString(),
    });
  }

  const body = await res.text();
  return Response.json(
    {
      ok: false,
      status: res.status,
      body: body.slice(0, 500),
      repo,
    },
    { status: 502 },
  );
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const result = await dispatchCatchUp(env);
    if (!result.ok) {
      const text = await result.text();
      console.error("[cf-catchup-cron] dispatch failed", text);
    } else {
      console.log("[cf-catchup-cron] dispatched catchup-watchdog");
    }
  },

  /** Manual smoke: GET / or /dispatch */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/dispatch" || url.pathname === "/") {
      if (request.method === "POST" || url.searchParams.get("run") === "1") {
        return dispatchCatchUp(env);
      }
      return Response.json({
        ok: true,
        service: "cf-catchup-cron",
        hint: "POST /dispatch or GET /?run=1 to trigger; cron handles probes",
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
