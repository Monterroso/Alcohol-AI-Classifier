import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alcohol Label Review",
  description: "Bulk upload and review workflow for alcohol label applications.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
