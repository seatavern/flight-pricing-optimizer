import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flight Optimizer — Flight Simulator",
  description:
    "Airline pricing and revenue-management simulator for inspecting fare demand by selling period.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sourceSans.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-navy">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
