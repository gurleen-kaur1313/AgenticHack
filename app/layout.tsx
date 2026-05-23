import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MindMesh",
  description: "Autonomous mental wellness orchestration dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
