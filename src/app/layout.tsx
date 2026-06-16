import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pointages — Bleu Citron",
  description: "Suivi et relances des points de vente",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
