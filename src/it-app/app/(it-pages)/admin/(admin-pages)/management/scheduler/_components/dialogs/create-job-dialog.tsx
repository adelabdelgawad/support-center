"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toastSuccess, toastError } from "@/lib/toast";
import type { TaskFunction, JobType } from "@/lib/actions/scheduler.actions";

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskFunctions: TaskFunction[];
  jobTypes: JobType[];
  onJobCreated: () => void;
}

export function CreateJobDialog({
  open,
  onOpenChange,
  taskFunctions,
  jobTypes,
  onJobCreated,
}: CreateJobDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    taskFunctionId: "",
    jobTypeId: "",
    intervalValue: "",
    intervalUnit: "minutes",
    cronMinute: "0",
    cronHour: "*",
    isEnabled: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const taskFunctionId = parseInt(formData.taskFunctionId);
      const jobTypeId = parseInt(formData.jobTypeId);

      // Build schedule config based on job type
      let scheduleConfig: Record<string, unknown> = {};

      const jobType = jobTypes.find((jt) => jt.id === jobTypeId);
      if (jobType?.name === "interval") {
        const value = parseInt(formData.intervalValue);
        scheduleConfig = {
          [formData.intervalUnit === "seconds"
            ? "seconds"
            : formData.intervalUnit === "minutes"
            ? "minutes"
            : "hours"]: value,
        };
      } else if (jobType?.name === "cron") {
        scheduleConfig = {
          second: "0",
          minute: formData.cronMinute,
          hour: formData.cronHour,
          day: "*",
          month: "*",
          day_of_week: "*",
        };
      }

      const response = await fetch("/api/scheduler/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || undefined,
          taskFunctionId,
          jobTypeId,
          scheduleConfig,
          isEnabled: formData.isEnabled,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to create job");
      }

      toastSuccess("Job Created - Scheduled job has been created successfully.");

      onOpenChange(false);
      onJobCreated();

      // Reset form
      setFormData({
        name: "",
        description: "",
        taskFunctionId: "",
        jobTypeId: "",
        intervalValue: "",
        intervalUnit: "minutes",
        cronMinute: "0",
        cronHour: "*",
        isEnabled: true,
      });
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : "Failed to create scheduled job."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const selectedJobType = jobTypes.find(
    (jt) => jt.id === parseInt(formData.jobTypeId)
  );
  const isInterval = selectedJobType?.name === "interval";
  const isCron = selectedJobType?.name === "cron";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Scheduled Job</DialogTitle>
          <DialogDescription>
            Configure a new automated task to run on a schedule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Job Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Daily Backup"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="What does this job do?"
              rows={2}
            />
          </div>

          {/* Task Function */}
          <div className="space-y-2">
            <Label htmlFor="taskFunction">Task Function *</Label>
            <Select
              value={formData.taskFunctionId}
              onValueChange={(value) =>
                setFormData({ ...formData, taskFunctionId: value })
              }
              required
            >
              <SelectTrigger id="taskFunction">
                <SelectValue placeholder="Select a task" />
              </SelectTrigger>
              <SelectContent>
                {taskFunctions.map((tf) => (
                  <SelectItem key={tf.id} value={tf.id.toString()}>
                    <div className="flex flex-col">
                      <span className="font-medium">{tf.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {tf.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Job Type */}
          <div className="space-y-2">
            <Label htmlFor="jobType">Schedule Type *</Label>
            <Select
              value={formData.jobTypeId}
              onValueChange={(value) =>
                setFormData({ ...formData, jobTypeId: value })
              }
              required
            >
              <SelectTrigger id="jobType">
                <SelectValue placeholder="Select schedule type" />
              </SelectTrigger>
              <SelectContent>
                {jobTypes.map((jt) => (
                  <SelectItem key={jt.id} value={jt.id.toString()}>
                    <div className="flex flex-col">
                      <span className="font-medium">{jt.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {jt.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Interval Schedule */}
          {isInterval && (
            <div className="space-y-2">
              <Label>Interval *</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  value={formData.intervalValue}
                  onChange={(e) =>
                    setFormData({ ...formData, intervalValue: e.target.value })
                  }
                  placeholder="30"
                  className="flex-1"
                  required
                />
                <Select
                  value={formData.intervalUnit}
                  onValueChange={(value) =>
                    setFormData({ ...formData, intervalUnit: value })
                  }
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">Seconds</SelectItem>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Run every {formData.intervalValue || "X"} {formData.intervalUnit}
              </p>
            </div>
          )}

          {/* Cron Schedule */}
          {isCron && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cronHour">Hour (0-23 or *)</Label>
                <Input
                  id="cronHour"
                  value={formData.cronHour}
                  onChange={(e) =>
                    setFormData({ ...formData, cronHour: e.target.value })
                  }
                  placeholder="*"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cronMinute">Minute (0-59)</Label>
                <Input
                  id="cronMinute"
                  value={formData.cronMinute}
                  onChange={(e) =>
                    setFormData({ ...formData, cronMinute: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Run at {formData.cronHour}:{formData.cronMinute} every day
              </p>
            </div>
          )}

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isEnabled">Enable Job</Label>
              <p className="text-xs text-muted-foreground">
                Job will run automatically when enabled
              </p>
            </div>
            <Switch
              id="isEnabled"
              checked={formData.isEnabled}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isEnabled: checked })
              }
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
