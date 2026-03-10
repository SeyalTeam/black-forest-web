import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import { OrderProvider } from "@/components/order-provider";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Blackforest Order Web",
  description: "Customer ordering website prototype for table QR flow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${playfair.variable}`}>
        <OrderProvider>{children}</OrderProvider>
      </body>
    </html>
  );
}
