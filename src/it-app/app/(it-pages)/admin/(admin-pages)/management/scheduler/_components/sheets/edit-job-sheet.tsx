"use client";

import { useState, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import type { ScheduledJob, TaskFunction, JobType } from "@/lib/actions/scheduler.actions";
import { Clock, Loader2, Pencil, Settings } from "lucide-react";

interface EditJobSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: ScheduledJob | null;
  taskFunctions: TaskFunction[];
  jobTypes: JobType[];
  onJobUpdated: (updatedJob: ScheduledJob) => void;
}

interface FormData {
  name: string;
  description: string;
  taskFunctionId: string;
  jobTypeId: string;
  intervalValue: string;
  intervalUnit: "seconds" | "minutes" | "hours";
  cronSecond: string;
  cronMinute: string;
  cronHour: string;
  cronDay: string;
  cronMonth: string;
  cronDayOfWeek: string;
  isEnabled: boolean;
}

function parseScheduleConfig(
  job: ScheduledJob,
  jobTypes: JobType[]
): Partial<FormData> {
  const jobType = jobTypes.find((jt) => jt.id === job.jobTypeId);
  const config = job.scheduleConfig;

  if (jobType?.name === "interval") {
    if (config.hours && Number(config.hours) > 0) {
      return { intervalValue: String(config.hours), intervalUnit: "hours" };
    }
    if (config.minutes && Number(config.minutes) > 0) {
      return { intervalValue: String(config.minutes), intervalUnit: "minutes" };
    }
    if (config.seconds && Number(config.seconds) > 0) {
      return { intervalValue: String(config.seconds), intervalUnit: "seconds" };
    }
  }

  if (jobType?.name === "cron") {
    return {
      cronSecond: String(config.second ?? "0"),
      cronMinute: String(config.minute ?? "0"),
      cronHour: String(config.hour ?? "*"),
      cronDay: String(config.day ?? "*"),
      cronMonth: String(config.month ?? "*"),
      cronDayOfWeek: String(config.day_of_week ?? "*"),
    };
  }

  return {};
}

export function EditJobSheet({
  open,
  onOpenChange,
  job,
  taskFunctions,
  jobTypes,
  onJobUpdated,
}: EditJobSheetProps) {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    description: "",
    taskFunctionId: "",
    jobTypeId: "",
    intervalValue: "",
    intervalUnit: "minutes",
    cronSecond: "0",
    cronMinute: "0",
    cronHour: "*",
    cronDay: "*",
    cronMonth: "*",
    cronDayOfWeek: "*",
    isEnabled: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-populate form when job changes
  useEffect(() => {
    if (open && job) {
      const parsed = parseScheduleConfig(job, jobTypes);
      setFormData({
        name: job.name,
        description: job.description || "",
        taskFunctionId: String(job.taskFunctionId),
        jobTypeId: String(job.jobTypeId),
        intervalValue: "",
        intervalUnit: "minutes",
        cronSecond: "0",
        cronMinute: "0",
        cronHour: "*",
        cronDay: "*",
        cronMonth: "*",
        cronDayOfWeek: "*",
        isEnabled: job.isEnabled,
        ...parsed,
      });
      setIsSubmitting(false);
    }
  }, [open, job, jobTypes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setIsSubmitting(true);

    try {
      const taskFunctionId = parseInt(formData.taskFunctionId);
      const jobTypeId = parseInt(formData.jobTypeId);

      let scheduleConfig: Record<string, unknown> = {};
      const jobType = jobTypes.find((jt) => jt.id === jobTypeId);

      if (jobType?.name === "interval") {
        const value = parseInt(formData.intervalValue);
        scheduleConfig = { [formData.intervalUnit]: value };
      } else if (jobType?.name === "cron") {
        scheduleConfig = {
          second: formData.cronSecond,
          minute: formData.cronMinute,
          hour: formData.cronHour,
          day: formData.cronDay,
          month: formData.cronMonth,
          day_of_week: formData.cronDayOfWeek,
        };
      }

      const response = await fetch(`/api/scheduler/jobs/${job.id}`, {
        method: "PUT",
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
        throw new Error(error.detail || "Failed to update job");
      }

      const updatedJob = await response.json();
      toastSuccess("Job Updated - Scheduled job has been updated successfully.");
      onOpenChange(false);
      onJobUpdated(updatedJob);
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : "Failed to update scheduled job."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const selectedJobType = jobTypes.find(
    (jt) => jt.id === parseInt(formData.jobTypeId)
  );
  const isInterval = selectedJobType?.name === "interval";
  const isCron = selectedJobType?.name === "cron";

  const selectedTaskFunction = taskFunctions.find(
    (tf) => tf.id === parseInt(formData.taskFunctionId)
  );

  const isBusy = isSubmitting;
  const isFormValid =
    formData.name.trim() !== "" &&
    formData.taskFunctionId !== "" &&
    formData.jobTypeId !== "" &&
    ((isInterval && formData.intervalValue !== "") || isCron);

  return (
    <Sheet open={open} onOpenChange={handleCancel}>
      <SheetContent
        className="w-full sm:max-w-2xl lg:max-w-3xl flex flex-col p-0"
        side="right"
      >
        <SheetHeader className="px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SheetTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Pencil className="h-5 w-5 text-primary" />
            </div>
            Edit Scheduled Job
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Modify the configuration of <strong className="text-foreground">{job?.name}</strong>.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <form id="edit-job-form" onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Information Card */}
              <Card className="border-2 border-muted hover:border-primary/30 transition-all duration-200">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base font-medium">
                    <Settings className="h-4 w-4 text-primary" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name" className="flex items-center gap-1">
                      Job Name
                      <span className="text-destructive text-sm">*</span>
                    </Label>
                    <Input
                      id="edit-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Daily Backup"
                      disabled={isBusy}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="What does this job do?"
                      rows={2}
                      disabled={isBusy}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-taskFunction" className="flex items-center gap-1">
                      Task Function
                      <span className="text-destructive text-sm">*</span>
                    </Label>
                    <Select
                      value={formData.taskFunctionId}
                      onValueChange={(value) => setFormData({ ...formData, taskFunctionId: value })}
                      disabled={isBusy}
                      required
                    >
                      <SelectTrigger id="edit-taskFunction">
                        <SelectValue placeholder="Select a task" />
                      </SelectTrigger>
                      <SelectContent>
                        {taskFunctions.map((tf) => (
                          <SelectItem key={tf.id} value={tf.id.toString()}>
                            <div className="flex flex-col">
                              <span className="font-medium">{tf.displayName}</span>
                              {tf.description && (
                                <span className="text-xs text-muted-foreground">{tf.description}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedTaskFunction && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
                        <div className="text-sm">
                          <span className="font-medium text-muted-foreground block mb-1">Selected Task:</span>
                          <div className="font-medium text-primary">{selectedTaskFunction.displayName}</div>
                          {selectedTaskFunction.description && (
                            <div className="text-xs text-muted-foreground mt-1">{selectedTaskFunction.description}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Schedule Configuration Card */}
              <Card className="border-2 border-muted hover:border-primary/30 transition-all duration-200">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base font-medium">
                      <Clock className="h-4 w-4 text-primary" />
                      Schedule Configuration
                    </CardTitle>
                    {selectedJobType && (
                      <Badge variant="secondary" className="font-normal text-xs px-2 py-1">
                        {selectedJobType.displayName}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-jobType" className="flex items-center gap-1">
                      Schedule Type
                      <span className="text-destructive text-sm">*</span>
                    </Label>
                    <Select
                      value={formData.jobTypeId}
                      onValueChange={(value) => setFormData({ ...formData, jobTypeId: value })}
                      disabled={isBusy}
                      required
                    >
                      <SelectTrigger id="edit-jobType">
                        <SelectValue placeholder="Select schedule type" />
                      </SelectTrigger>
                      <SelectContent>
                        {jobTypes.map((jt) => (
                          <SelectItem key={jt.id} value={jt.id.toString()}>
                            <div className="flex flex-col">
                              <span className="font-medium">{jt.displayName}</span>
                              {jt.description && (
                                <span className="text-xs text-muted-foreground">{jt.description}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Interval Schedule */}
                  {isInterval && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Interval
                        <span className="text-destructive text-sm">*</span>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min="1"
                          value={formData.intervalValue}
                          onChange={(e) => setFormData({ ...formData, intervalValue: e.target.value })}
                          placeholder="30"
                          className="flex-1"
                          disabled={isBusy}
                          required
                        />
                        <Select
                          value={formData.intervalUnit}
                          onValueChange={(value: "seconds" | "minutes" | "hours") =>
                            setFormData({ ...formData, intervalUnit: value })
                          }
                          disabled={isBusy}
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
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="edit-cronSecond">Second</Label>
                          <Input
                            id="edit-cronSecond"
                            value={formData.cronSecond}
                            onChange={(e) => setFormData({ ...formData, cronSecond: e.target.value })}
                            placeholder="0"
                            disabled={isBusy}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-cronMinute">Minute</Label>
                          <Input
                            id="edit-cronMinute"
                            value={formData.cronMinute}
                            onChange={(e) => setFormData({ ...formData, cronMinute: e.target.value })}
                            placeholder="0"
                            disabled={isBusy}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-cronHour">Hour</Label>
                          <Input
                            id="edit-cronHour"
                            value={formData.cronHour}
                            onChange={(e) => setFormData({ ...formData, cronHour: e.target.value })}
                            placeholder="*"
                            disabled={isBusy}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="edit-cronDay">Day</Label>
                          <Input
                            id="edit-cronDay"
                            value={formData.cronDay}
                            onChange={(e) => setFormData({ ...formData, cronDay: e.target.value })}
                            placeholder="*"
                            disabled={isBusy}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-cronMonth">Month</Label>
                          <Input
                            id="edit-cronMonth"
                            value={formData.cronMonth}
                            onChange={(e) => setFormData({ ...formData, cronMonth: e.target.value })}
                            placeholder="*"
                            disabled={isBusy}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-cronDayOfWeek">Day of Week</Label>
                          <Input
                            id="edit-cronDayOfWeek"
                            value={formData.cronDayOfWeek}
                            onChange={(e) => setFormData({ ...formData, cronDayOfWeek: e.target.value })}
                            placeholder="*"
                            disabled={isBusy}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {formData.cronSecond} {formData.cronMinute} {formData.cronHour} {formData.cronDay} {formData.cronMonth} {formData.cronDayOfWeek}
                      </p>
                    </div>
                  )}

                  {/* Enabled Switch */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="space-y-0.5">
                      <Label htmlFor="edit-isEnabled" className="text-sm font-medium">Enable Job</Label>
                      <p className="text-xs text-muted-foreground">Job will run automatically when enabled</p>
                    </div>
                    <Switch
                      id="edit-isEnabled"
                      checked={formData.isEnabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
                      disabled={isBusy}
                    />
                  </div>
                </CardContent>
              </Card>
            </form>
          </ScrollArea>
        </div>

        <SheetFooter className="p-6 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isBusy}
              className="flex-1 sm:flex-none min-w-[120px] h-10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-job-form"
              disabled={!isFormValid || isBusy}
              className="flex-1 sm:flex-none min-w-[120px] h-10"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
