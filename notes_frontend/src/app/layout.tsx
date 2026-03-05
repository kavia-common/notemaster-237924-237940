import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./state/auth";

export const metadata: Metadata = {
  title: "NoteMaster",
  description: "Retro-modern notes: Markdown, tags, search, pin/favorite, autosave.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
