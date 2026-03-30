import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Masterclass — 5 YouTube Mistakes Making You Invisible to Clients",
  description:
    "Join Jared Chamberlain for this powerful FREE masterclass where he'll show you exactly how to transform your YouTube strategy to attract clients instead of chasing them.",
};

export default function WebinarRegistrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://api.fontshare.com" />
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@800,700,500&display=swap"
      />
      {children}
    </>
  );
}
