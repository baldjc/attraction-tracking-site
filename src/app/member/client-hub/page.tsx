import PageHeader from "@/components/PageHeader";
import ClientHubClient from "./ClientHubClient";

export default function ClientHubPage() {
  return (
    <>
      <PageHeader
        emoji="🏢"
        title="Client Hub"
        description="Your production dashboard — assets, pipeline status, and quick links."
      />
      <ClientHubClient />
    </>
  );
}
