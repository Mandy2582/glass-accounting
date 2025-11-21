import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import styles from "@/components/Layout.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Glass Wholesale Accounting",
  description: "Accounting software for glass business",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className={styles.layout}>
          <Sidebar />
          <div className={styles.mainContent}>
            <Header />
            <main className={styles.pageContent}>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
