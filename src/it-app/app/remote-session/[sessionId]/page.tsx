import type { Metadata } from 'next';
import { redirect } from "next/navigation";
import RemoteSessionWrapper from "./_components/remote-session-wrapper";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

// Generate dynamic metadata (no blocking fetch)
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sessionId } = await params;
  const shortId = sessionId.split('-')[0].toUpperCase();

  return {
    title: `Remote Session ${shortId}`,
    description: 'Active remote desktop session',
  };
}

async function getRemoteSession(sessionId: string) {
  // In production, fetch session details server-side
  return { sessionId };
}

export default async function RemoteSessionPage({ params }: PageProps) {
  const { sessionId } = await params;

  // Basic UUID validation
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sessionId)) {
    redirect("/support-center/requests");
  }

  const session = await getRemoteSession(sessionId);

  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      <RemoteSessionWrapper sessionId={sessionId} />
    </div>
  );
}
