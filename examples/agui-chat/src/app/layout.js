import { Inter } from "next/font/google";
import "./globals.css";
const inter = Inter({ subsets: ["latin"] });
export const metadata = {
    title: "DeepCitation Chat - AG-UI Protocol Example",
    description: "Chat with documents using AG-UI protocol and verified AI citations",
};
export default function RootLayout({ children }) {
    return (<html lang="en">
      <body className={inter.className}>
        <nav className="bg-white border-b px-6 py-2 flex items-center gap-4 text-sm">
          <span className="font-semibold text-gray-900">DeepCitation</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500">AG-UI Chat</span>
        </nav>
        {children}
      </body>
    </html>);
}
