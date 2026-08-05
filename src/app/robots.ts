import type { MetadataRoute } from "next";

const SITE = "https://www.stock-bench.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/ops", "/api/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
