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
  await validateAgentAccess();

  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login");
  }

  const devicesData = await getDevices();

  return <DevicesTab initialData={devicesData} />;
}
