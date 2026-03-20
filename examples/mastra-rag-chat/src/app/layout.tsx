import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeepCitation Mastra RAG Chat",
  description: "Runnable Next.js + Mastra RAG example with DeepCitation citation verification.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
