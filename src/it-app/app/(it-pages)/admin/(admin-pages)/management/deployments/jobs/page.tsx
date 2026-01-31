import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server-auth";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getDeploymentJobs } from "@/lib/actions/deployment-jobs.actions";
import { JobsTab } from "../_components/jobs/jobs-tab";

export const metadata = {
  title: 'Jobs - Deployments',
  description: 'Manage deployment jobs',
};

/**
 * Deployment Jobs Page
 * Admin page for viewing deployment job status and history.
 * Location: /management/deployments/jobs
 */
export default async function DeploymentsJobsPage() {
  // Parallelize auth validation, session check, and data fetching
  const [_, session, jobsData] = await Promise.all([
    validateAgentAccess(),
    auth(),
    getDeploymentJobs(),
  ]);

  if (!session?.accessToken) {
    redirect("/login");
  }

  return <JobsTab initialData={jobsData} />;
}
