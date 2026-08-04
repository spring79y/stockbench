/** Google News 래퍼 URL → 원문 URL, 기사 실제 게시일 검증 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BATCH_EXECUTE =
  "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je";

function googleNewsArticleId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("news.google.")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "articles" || p === "read");
    if (idx < 0 || !parts[idx + 1]) return null;
    return parts[idx + 1];
  } catch {
    return null;
  }
}

/** post-2024 Google News articles/CBMi… → 출판사 원문 URL */
export async function resolveGoogleNewsUrl(
  articleUrl: string,
  timeoutMs = 12_000,
): Promise<string | null> {
  const articleId = googleNewsArticleId(articleUrl);
  if (!articleId) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const pageUrl = `https://news.google.com/articles/${articleId}?hl=ko&gl=KR&ceid=KR:ko`;
    const pageRes = await fetch(pageUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!signature || !timestamp) return null;

    const rpcInner = JSON.stringify([
      "garturlreq",
      [
        [
          "ko",
          "KR",
          ["FINANCE_TOP_INDICES", "WEB_TEST_1_0_0"],
          null,
          null,
          1,
          1,
          "KR:ko",
          null,
          1,
          null,
          null,
          null,
          null,
          null,
          0,
          1,
        ],
        "ko",
        "KR",
        1,
        [1, 1, 1],
        1,
        1,
        null,
        0,
        0,
        null,
        0,
      ],
      articleId,
      Number(timestamp),
      signature,
    ]);
    const fReq = JSON.stringify([[["Fbv4je", rpcInner, null, "generic"]]]);
    const postRes = await fetch(BATCH_EXECUTE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": USER_AGENT,
        Referer: "https://news.google.com/",
      },
      body: `f.req=${encodeURIComponent(fReq)}`,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!postRes.ok) return null;
    let body = await postRes.text();
    if (body.startsWith(")]}'")) {
      body = body.split("\n").slice(1).join("\n").trim();
    }
    const firstLine = body.split("\n").find((l) => l.trim().startsWith("["));
    if (!firstLine) return null;
    const envelopes = JSON.parse(firstLine) as unknown[];
    for (const env of envelopes) {
      if (
        Array.isArray(env) &&
        env[0] === "wrb.fr" &&
        env[1] === "Fbv4je" &&
        typeof env[2] === "string"
      ) {
        const payload = JSON.parse(env[2]) as unknown[];
        if (payload?.[0] === "garturlres" && typeof payload[1] === "string") {
          return payload[1];
        }
      }
    }
    return null;
  } catch (error) {
    console.error("[news] resolve google url failed", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toIsoDate(y: number, m: number, d: number, hh = 0, mm = 0): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm));
  // 한국 표기 시각을 KST로 해석 → UTC 저장
  const asKst = new Date(dt.getTime() - 9 * 60 * 60 * 1000);
  if (Number.isNaN(asKst.getTime())) return null;
  return asKst.toISOString();
}

/**
 * 본문 상단의 바이라인 날짜를 우선 (meta datePublished는 재게시·페이지생성 시각인 경우가 많음).
 */
export function extractArticlePublishedAt(html: string): string | null {
  if (!html) return null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  // 관련 뉴스 섹션 이전만 사용
  const cut = text.search(
    /관련\s*뉴스|최근\s*뉴스|함께\s*본|추천\s*기사|더\s*보기|copyright|저작권/i,
  );
  const head = cut > 500 ? text.slice(0, cut) : text.slice(0, 12_000);

  const tryParse = (
    y: string,
    mo: string,
    d: string,
    hh?: string,
    mm?: string,
  ): string | null =>
    toIsoDate(
      Number(y),
      Number(mo),
      Number(d),
      hh != null ? Number(hh) : 12,
      mm != null ? Number(mm) : 0,
    );

  // 1) 상단에 처음 등장하는 바이라인 날짜 (재수집 meta보다 신뢰)
  const bylineRe =
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?|(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*(\d{1,2}):(\d{2}))?/;
  const byline = head.match(bylineRe);
  if (byline) {
    const iso = byline[1]
      ? tryParse(byline[1], byline[2], byline[3], byline[4], byline[5])
      : tryParse(byline[6]!, byline[7]!, byline[8]!, byline[9], byline[10]);
    if (iso) return iso;
  }

  // 2) 이미지·경로에 박힌 YYYYMMDDHHMM
  const embedded = head.match(
    /(?:^|[^\d])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])([0-5]\d)/,
  );
  if (embedded) {
    const iso = tryParse(
      embedded[1],
      embedded[2],
      embedded[3],
      embedded[4],
      embedded[5],
    );
    if (iso) return iso;
  }

  // 3) meta (최후 수단 — 재게시 시각일 수 있음)
  const meta =
    html.match(
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    )?.[1] ??
    html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1];
  if (meta) {
    const t = new Date(meta);
    if (!Number.isNaN(t.getTime())) return t.toISOString();
  }
  return null;
}

export async function fetchPublisherPublishedAt(
  publisherUrl: string,
  timeoutMs = 10_000,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(publisherUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractArticlePublishedAt(html);
  } catch (error) {
    console.error("[news] publisher fetch failed", publisherUrl, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function isWithinMaxAge(iso: string, maxAgeDays: number, now = Date.now()): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= maxAgeDays * 24 * 60 * 60 * 1000;
}
