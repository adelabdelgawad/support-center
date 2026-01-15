"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateJobSheet } from "../sheets/create-job-sheet";
import type { TaskFunction, JobType, ScheduledJob } from "@/lib/actions/scheduler.actions";

interface AddJobButtonProps {
  onAdd: () => void;
  addJob: (newJob: ScheduledJob) => Promise<void>;
  taskFunctions: TaskFunction[];
  jobTypes: JobType[];
}

export function AddJobButton({ onAdd, addJob, taskFunctions, jobTypes }: AddJobButtonProps) {
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setShowCreateSheet(true)}>
        <Plus className="h-4 w-4 mr-2" />
        New Job
      </Button>

      <CreateJobSheet
        open={showCreateSheet}
        onOpenChange={setShowCreateSheet}
        taskFunctions={taskFunctions}
        jobTypes={jobTypes}
        onJobCreated={async (newJob) => {
          // Use optimistic update instead of full refetch
          await addJob(newJob);
          setShowCreateSheet(false);
        }}
      />
    </>
  );
}
