import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "ops_auth";

function unauthorized(): NextResponse {
  return new NextResponse("Unauthorized — set OPS_SECRET and open /ops?key=…", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}

function isAuthorized(request: NextRequest, secret: string): boolean {
  const key = request.nextUrl.searchParams.get("key");
  if (key && key === secret) return true;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const cookie = request.cookies.get(COOKIE)?.value;
  if (cookie && cookie === secret) return true;

  return false;
}

export function proxy(request: NextRequest) {
  const secret = process.env.OPS_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "development") {
      const res = NextResponse.next();
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
      return res;
    }
    return new NextResponse("OPS_SECRET is not configured", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "no-store",
      },
    });
  }

  if (!isAuthorized(request, secret)) {
    return unauthorized();
  }

  const url = request.nextUrl.clone();
  const hadKey = url.searchParams.has("key");
  if (hadKey) {
    url.searchParams.delete("key");
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/ops",
      maxAge: 60 * 60 * 24 * 30,
    });
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/ops", "/ops/:path*"],
};
