import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

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
  other: { "codex-preview": "development" },
};

export const viewport: Viewport = {
  themeColor: "#07131f",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
