import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono, Sedgwick_Ave_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { SquircleDefs } from "@/components/Reveal";
import { CHAIN_NAME } from "@/lib/config";
import { I18nProvider } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700", "800"] });
const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const logo = Sedgwick_Ave_Display({ variable: "--font-sedgwick", subsets: ["latin"], weight: "400" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Absolute base for share images: explicit site URL, else Vercel's production domain, else local dev.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
const DESCRIPTION = `Fair draws for seats, scholarships and anything in short supply, on ${CHAIN_NAME}. Join any time while it's open; a fair draw picks the winners and anyone can check it.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Next — Everyone in line. Nobody cuts in.",
  description: DESCRIPTION,
  openGraph: { title: "Next — Everyone in line. Nobody cuts in.", description: DESCRIPTION, siteName: "Next", type: "website" },
  twitter: { card: "summary_large_image", title: "Next — Everyone in line. Nobody cuts in.", description: DESCRIPTION },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getT();
  return (
    <html lang={locale} className={`${display.variable} ${sans.variable} ${mono.variable} ${logo.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <SquircleDefs />
        <Providers>
          <I18nProvider initial={locale}>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 btn-volt px-4 py-2 rounded-full">{t("Skip to content")}</a>
          <div className="sheet flex-1 flex flex-col pb-16 md:pb-24">
            <Nav />
            <main id="main" className="flex-1">{children}</main>
          </div>
          <Footer />
          </I18nProvider>
        </Providers>
      </body>
    </html>
  );
}
