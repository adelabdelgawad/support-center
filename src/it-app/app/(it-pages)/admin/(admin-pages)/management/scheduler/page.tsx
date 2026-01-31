import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server-auth";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import {
  getScheduledJobs,
  getTaskFunctions,
  getJobTypes,
} from "@/lib/actions/scheduler.actions";
import { SchedulerContent } from "./_components/scheduler-content";

export const metadata = {
  title: "Scheduler - Management",
  description: "Manage scheduled jobs and task automation",
};

/**
 * Scheduler Management Page
 * Admin page for managing scheduled jobs and task automation.
 * Location: /management/scheduler
 */
export default async function SchedulerPage() {
  // Parallelize auth validation, session check, and data fetching
  const [_, session, jobsData, taskFunctions, jobTypes] = await Promise.all([
    validateAgentAccess(),
    auth(),
    getScheduledJobs({ page: 1, perPage: 50 }),
    getTaskFunctions(),
    getJobTypes(),
  ]);

  if (!session?.accessToken) {
    redirect("/login");
  }

  return (
    <SchedulerContent
      initialJobs={jobsData}
      initialTaskFunctions={taskFunctions}
      initialJobTypes={jobTypes}
    />
  );
}
