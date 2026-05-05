import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FAULT//FOUND — PLC Troubleshooting Simulator",
  description:
    "A browser-based 3D game where players diagnose pre-injected faults on live factory floors. First-person troubleshooting mystery with narrative tension.",
  keywords: [
    "PLC",
    "troubleshooting",
    "simulator",
    "training",
    "industrial",
    "maintenance",
    "3D game",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          overflow: "hidden",
          background: "#0a0a0a",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
