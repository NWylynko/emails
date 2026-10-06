import { Toaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-white antialiased`}>
        <ClerkProvider>
          <main className="px-4 py-6">{children}</main>
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
