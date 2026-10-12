import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono, Sedgwick_Ave_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { SquircleDefs } from "@/components/Reveal";
import { CHAIN_NAME } from "@/lib/config";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700", "800"] });
const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const logo = Sedgwick_Ave_Display({ variable: "--font-sedgwick", subsets: ["latin"], weight: "400" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Next — Everyone in line. Nobody cuts in.",
  description: `Fair-access draws for scarce seats and scholarships on ${CHAIN_NAME}. Register any time in the window; a public seed picks the winners.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} ${logo.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <SquircleDefs />
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 btn-volt px-4 py-2 rounded-full">Skip to content</a>
          <div className="sheet flex-1 flex flex-col pb-16 md:pb-24">
            <Nav />
            <main id="main" className="flex-1">{children}</main>
          </div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
