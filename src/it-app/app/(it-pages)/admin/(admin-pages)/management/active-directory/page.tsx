import { getActiveConfig } from "@/lib/actions/active-directory-config.actions";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { AWSStyleConfig } from "./_components/aws-style-config";

export const metadata = {
  title: "Active Directory Configuration - IT Support Center",
  description: "Manage Active Directory configuration",
};

export default async function ActiveDirectoryPage() {
  let config;

  try {
    const [, configData] = await Promise.all([
      validateAgentAccess(),
      getActiveConfig(),
    ]);
    config = configData;
  } catch (error) {
    console.error("Failed to fetch AD configuration:", error);
    config = null;
  }

  return <AWSStyleConfig initialConfig={config} />;
}
