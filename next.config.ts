import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Static export — the whole game is a client bundle plus assets.
   *
   * Every route already prerenders as static content and nothing here uses a
   * server feature: no API routes, no server actions, no `next/headers`, no
   * image optimisation. So this produces a plain `out/` directory, which is
   * exactly what Cloudflare Pages serves.
   *
   * Deliberately NOT @cloudflare/next-on-pages. That adapter exists to run
   * Next's SERVER on Workers and brings edge-runtime constraints with it. There
   * is no server here to adapt, so taking the adapter would be paying its costs
   * for none of its benefit.
   */
  output: "export",

  /**
   * Cloudflare Pages serves /foo from /foo/index.html. Without this, a refresh
   * or a deep link on any route other than "/" 404s — the classic way a
   * statically exported Next app looks broken to the first person you send it
   * to. Costs nothing today with one route, and prevents a bug that would only
   * surface once there is a second.
   */
  trailingSlash: true,

  images: {
    // There is no image optimiser in a static export. Saying so makes a misuse
    // fail at build time instead of on somebody's first page load.
    unoptimized: true,
  },
};

export default nextConfig;
