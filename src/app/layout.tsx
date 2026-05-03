import type { Metadata } from "next";

import { ApplicationDataBridge } from "@/components/ApplicationDataBridge";

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
      <body>
        <ApplicationDataBridge />
        {children}
      </body>
    </html>
  );
}
