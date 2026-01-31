import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server-auth";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getDevices } from "@/lib/actions/devices.actions";
import { DevicesTab } from "./_components/devices/devices-tab";

export const metadata = {
  title: 'Devices - Deployments',
  description: 'Manage device discovery and deployment',
};

/**
 * Devices Management Page
 * Admin page for managing device discovery and deployment.
 * Location: /management/deployments
 */
export default async function DeploymentsDevicesPage() {
  // Parallelize auth validation, session check, and data fetching
  const [_, session, devicesData] = await Promise.all([
    validateAgentAccess(),
    auth(),
    getDevices(),
  ]);

  if (!session?.accessToken) {
    redirect("/login");
  }

  return <DevicesTab initialData={devicesData} />;
}
