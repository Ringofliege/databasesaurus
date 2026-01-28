import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/app-context";
import { MainLayout } from "@/components/layout/MainLayout";

export const metadata: Metadata = {
  title: "DB + Prisma Helper",
  description: "Internal database and Prisma management tool for Coolify",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppProvider>
          <MainLayout>{children}</MainLayout>
        </AppProvider>
      </body>
    </html>
  );
}
