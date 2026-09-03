import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ClerkSessionBridge } from "./clerk-session-bridge";
import { getRequestEnv } from "../lib/request-env";

export const metadata: Metadata = {
  title: {
    default: "FaultCite | Technician Console",
    template: "%s | FaultCite",
  },
  applicationName: "FaultCite",
  description: "Evidence-based CNC maintenance workflow, repair records, and approvals for industrial technicians.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "FaultCite",
    statusBarStyle: "black-translucent",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#07131f",
  colorScheme: "light",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const standalone = (await headers()).get("x-faultcite-runtime") === "standalone";
  const env = standalone ? getRequestEnv() : {};
  const publishableKey = env.CLERK_PUBLISHABLE_KEY?.trim();
  const frontendApi = env.CLERK_FRONTEND_API?.trim() || "https://clerk.faultcite.com";
  return (
    <html lang="en">
      <body>
        {standalone && publishableKey ? <ClerkSessionBridge publishableKey={publishableKey} frontendApi={frontendApi} /> : null}
        {children}
      </body>
    </html>
  );
}
