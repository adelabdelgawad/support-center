import type { Metadata } from 'next';
import RemoteSessionConnector from "./_components/remote-session-connector";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export const metadata: Metadata = {
  title: 'Connecting',
  description: 'Establishing remote session connection',
};

/**
 * Remote Session Connect Page
 *
 * Opens immediately when IT clicks "Remote Access" from Active Sessions.
 * Creates the session and connects - all within this page.
 */
export default async function RemoteSessionConnectPage({ params }: PageProps) {
  const { userId } = await params;

  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      <RemoteSessionConnector userId={userId} />
    </div>
  );
}
