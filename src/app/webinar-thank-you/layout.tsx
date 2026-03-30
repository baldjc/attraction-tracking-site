import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're Registered! — Attraction by Video Masterclass",
  description:
    "You've successfully registered for the free masterclass with Jared Chamberlain.",
};

export default function ThankYouLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
