import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/authz";
import { ensureStartupAutomation } from "@/lib/automation/runner";
import { db } from "@/lib/db";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "TalentFlow | Recruiting Operations",
  description: "A controlled, automated recruiting workflow prototype.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await ensureStartupAutomation();
  const [user, users] = await Promise.all([
    getCurrentUser(),
    db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
  ]);
  const notifications = await db.notification.count({
    where: { userId: user.id, readAt: null },
  });
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppShell user={user} users={users} notificationCount={notifications}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
