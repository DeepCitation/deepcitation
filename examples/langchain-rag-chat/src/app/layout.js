import "./globals.css";
export const metadata = {
    title: "DeepCitation LangChain RAG Chat",
    description: "Runnable Next.js + LangChain.js RAG example with DeepCitation citation verification.",
};
export default function RootLayout({ children }) {
    return (<html lang="en">
      <body>{children}</body>
    </html>);
}
