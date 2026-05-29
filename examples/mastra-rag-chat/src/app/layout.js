import "./globals.css";
export const metadata = {
    title: "DeepCitation Mastra RAG Chat",
    description: "Runnable Next.js + Mastra RAG example with DeepCitation citation verification.",
};
export default function RootLayout({ children }) {
    return (<html lang="en">
      <body>{children}</body>
    </html>);
}
