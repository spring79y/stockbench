import type { MetadataRoute } from "next";
import { listKnownEvents } from "@/lib/events/catalog";

const SITE = "https://www.stock-bench.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const home: MetadataRoute.Sitemap = [
    {
      url: `${SITE}/`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
  ];

  const events: MetadataRoute.Sitemap = listKnownEvents().map((event) => ({
    url: `${SITE}/events/${event.id}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...home, ...events];
}
