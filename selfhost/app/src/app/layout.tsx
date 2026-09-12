import type { Metadata } from "next";
import { getRuntimeConfig } from "@/lib/convert";
import "./globals.css";

// The title and the indexing policy both depend on the deployment mode, which
// is only known at request time.
export const dynamic = "force-dynamic";

const OPEN_TITLE = "Ekko Rules 订阅转换";
const OPEN_DESCRIPTION =
  "把机场订阅转换成 Clash、sing-box、Surge 等客户端的完整配置：节点、DNS、策略组与分流规则一个文件全给。服务器不保存订阅、节点或任何转换记录。";
const LOCAL_TITLE = "Ekko Rules 本地转换";
const LOCAL_DESCRIPTION =
  "在本机将订阅转换为已套用 Ekko Rules 的完整 Clash / Mihomo 配置。";

export function generateMetadata(): Metadata {
  const runtime = getRuntimeConfig();
  const open = !runtime.storedProfilesEnabled;
  const origin = runtime.subscriptionBaseUrl;

  if (!open) {
    return {
      title: LOCAL_TITLE,
      description: LOCAL_DESCRIPTION,
      // A personal machine has no business in a search index.
      robots: { index: false, follow: false },
    };
  }

  return {
    // An open deployment exists to be found, so it is indexable. Set
    // PUBLIC_BASE_URL for canonical and share URLs to resolve.
    metadataBase: origin ? new URL(origin) : undefined,
    title: { default: OPEN_TITLE, template: `%s · ${OPEN_TITLE}` },
    description: OPEN_DESCRIPTION,
    applicationName: "Ekko Rules",
    keywords: [
      "订阅转换",
      "Clash 订阅转换",
      "Mihomo 配置",
      "sing-box 配置",
      "subconverter",
      "分流规则",
      "Ekko Rules",
    ],
    authors: [{ name: "ZaunEkko", url: "https://zaunekko.com" }],
    creator: "ZaunEkko",
    alternates: origin ? { canonical: "/" } : undefined,
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    openGraph: {
      type: "website",
      siteName: "Ekko Rules",
      locale: "zh_CN",
      title: OPEN_TITLE,
      description: OPEN_DESCRIPTION,
      ...(origin ? { url: origin } : {}),
    },
    twitter: {
      card: "summary",
      title: OPEN_TITLE,
      description: OPEN_DESCRIPTION,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shell = getRuntimeConfig().storedProfilesEnabled ? "local" : "open";
  return (
    <html lang="zh-CN" data-shell={shell}>
      <body>{children}</body>
    </html>
  );
}
