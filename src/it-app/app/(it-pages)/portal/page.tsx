import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server-auth";
import { getClientVersions } from "@/lib/actions/client-versions.actions";
import PortalDownloadClient from "./_components/portal-download-client";

export default async function PortalPage() {
  // Ensure user is authenticated
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch active client versions
  const versionsData = await getClientVersions({ activeOnly: true });

  // Find the latest version (marked by admin)
  const latestVersion = versionsData?.versions?.find((v) => v.isLatest === true) || null;

  return (
    <PortalDownloadClient
      latestVersion={latestVersion}
      userName={user.fullName || user.username}
    />
  );
}
