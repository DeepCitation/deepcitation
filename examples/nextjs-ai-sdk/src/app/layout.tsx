import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DeepCitation Chat - Next.js AI SDK Example",
  description: "Chat with documents using verified AI citations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="bg-white border-b px-6 py-2 flex items-center gap-4 text-sm">
          <Link href="/" className="font-semibold text-gray-900 hover:text-blue-600">
            DeepCitation
          </Link>
          <span className="text-gray-300">|</span>
          <Link href="/" className="text-gray-600 hover:text-blue-600">
            Chat
          </Link>
          <Link href="/showcase" className="text-gray-600 hover:text-blue-600">
            Showcase
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
