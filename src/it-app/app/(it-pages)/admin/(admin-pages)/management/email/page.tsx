import { getActiveEmailConfig } from "@/lib/actions/email-config.actions";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { EmailConfigPage } from "./_components/email-config-page";

export const metadata = {
  title: "Email Configuration - IT Support Center",
  description: "Manage SMTP/Email configuration",
};

export default async function EmailPage() {
  let config;

  try {
    const [, configData] = await Promise.all([
      validateAgentAccess(),
      getActiveEmailConfig(),
    ]);
    config = configData;
  } catch (error) {
    console.error("Failed to fetch email configuration:", error);
    config = null;
  }

  return <EmailConfigPage initialConfig={config} />;
}
