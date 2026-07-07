import type { MetadataRoute } from "next";

const BASE_URL = "https://personastorm.nguyenhaan.id.vn";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/login`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
