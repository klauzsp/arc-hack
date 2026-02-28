import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import { Geist } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Payroll | Arc",
  description: "Multi-chain USDC payroll. One liquidity surface. Arc routes and settles.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={geist.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
