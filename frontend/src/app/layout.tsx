import type { Metadata } from "next";
import { Inconsolata } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import ThemeToggle from "@/components/theme-toggle";
import { UploadProvider } from "@/contexts/upload-context";

const inconsolata = Inconsolata({
  subsets: ["latin"],
  variable: "--font-inconsolata",
});

export const metadata: Metadata = {
  title: "Teek",
  description: "Turn long videos into viral-ready shorts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inconsolata.variable}>
      <body className={`${inconsolata.className} antialiased`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="supoclip-theme">
          <UploadProvider>
            {children}
          </UploadProvider>
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
