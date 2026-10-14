import { MessagesPage } from "@/components/messages";

// E-59 direct messages.
export const dynamic = "force-dynamic";

export default function Messages({ searchParams }: { searchParams: { c?: string; p?: string } }) {
  return <MessagesPage role="client" c={searchParams.c} p={searchParams.p} />;
}
