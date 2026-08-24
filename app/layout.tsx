import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Agent Bazaar",
  description:
    "A store AI agents shop at — every rupee explainable, bounded and gated. Razorpay AI Buildathon Track 01.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
