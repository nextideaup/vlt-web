import type { Metadata } from "next";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import ConditionalAppShell from "@/components/ConditionalAppShell";
import { ConfirmProvider } from "@/components/forms/ConfirmDialog";

export const metadata: Metadata = {
  title: "Vault 1",
  description: "Track your collectibles — Guitars, Watches, and more.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-background text-text">
        <SessionProvider>
          <ConfirmProvider>
            <ConditionalAppShell>{children}</ConditionalAppShell>
          </ConfirmProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
