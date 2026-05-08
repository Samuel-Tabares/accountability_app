import type { Metadata } from "next";
import { Baloo_2, Paytone_One } from "next/font/google";
import "./globals.css";

const body = Baloo_2({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body"
});

const display = Paytone_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "TRABIX | Control de ventas y embajadores",
  description: "Panel operativo para ventas de granizados, inventario, embajadores y finanzas.",
  icons: {
    icon: "/site-assets/brand/logo-trabix.png",
    apple: "/site-assets/brand/logo-trabix.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${body.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
