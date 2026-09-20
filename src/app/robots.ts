import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.APP_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nothing behind a login has any business in an index.
        disallow: ["/admin", "/dashboard", "/booking/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
