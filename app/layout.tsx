import type { Metadata } from "next";
// 1. Import the 'Inter' font from next/font/google
import { Inter } from "next/font/google";
import "./globals.css";

// 2. Initialize the font with the required subsets
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Facial Expression Detector", // You can customize the title
  description: "Analyze expressions in videos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* 3. Apply the font's className to the body tag */}
      <body className={inter.className}>{children}</body>
    </html>
  );
}