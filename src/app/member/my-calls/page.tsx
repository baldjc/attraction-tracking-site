import PageHeader from "@/components/PageHeader";
import MyCallsClient from "./MyCallsClient";

export default function MyCallsPage() {
  return (
    <>
      <PageHeader
        emoji="📹"
        title="My Calls"
        description="Your 1-on-1 call recordings with Jared, all in one place."
      />
      <MyCallsClient />
    </>
  );
}
