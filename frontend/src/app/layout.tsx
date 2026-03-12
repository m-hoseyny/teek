import type { Metadata } from "next";
import { Inconsolata } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { UploadProvider } from "@/contexts/upload-context";
import { JwtProvider } from "@/contexts/jwt-context";

const inconsolata = Inconsolata({
  subsets: ["latin"],
  variable: "--font-inconsolata",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://teek.studio";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Teek – AI Video Clipping Tool",
    template: "%s | Teek",
  },
  description:
    "Turn long videos into viral-ready short clips with AI. Teek automatically finds the best moments, adds subtitles, and exports 9:16 clips for TikTok, Reels & Shorts.",
  keywords: [
    "AI video clipping",
    "short clips",
    "video highlights",
    "TikTok clips",
    "Reels",
    "YouTube Shorts",
    "OpusClip alternative",
    "video editing",
    "automatic subtitles",
  ],
  authors: [{ name: "Teek" }],
  creator: "Teek",
  openGraph: {
    type: "website",
    url: APP_URL,
    siteName: "Teek",
    title: "Teek – AI Video Clipping Tool",
    description:
      "Turn long videos into viral-ready short clips with AI. Automatic highlights, subtitles, and 9:16 export for TikTok, Reels & Shorts.",
    images: [
      {
        url: "/brand/logo.png",
        alt: "Teek – AI Video Clipping Tool",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Teek – AI Video Clipping Tool",
    description:
      "Turn long videos into viral-ready short clips with AI. Automatic highlights, subtitles, and 9:16 export for TikTok, Reels & Shorts.",
    images: ["/brand/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inconsolata.variable}>
      <body className={`${inconsolata.className} antialiased`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="teek-theme">
          <JwtProvider>
            <UploadProvider>
              {children}
            </UploadProvider>
          </JwtProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
