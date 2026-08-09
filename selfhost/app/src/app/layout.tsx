import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ekko Rules 本地转换",
  description:
    "在本机将订阅转换为已套用 Ekko Rules 的完整 Clash / Mihomo 配置。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
