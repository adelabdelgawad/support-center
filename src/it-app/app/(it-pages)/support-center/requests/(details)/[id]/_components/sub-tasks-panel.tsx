'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  createSubTask,
  getSubTasksByRequest,
  getSubTaskStats,
  type SubTaskCreate,
  type SubTask,
} from '@/lib/api/sub-tasks';
import { getServiceSections, type ServiceSection } from '@/lib/api/service-sections';
import { useRequestDetail } from '../_context/request-detail-context';
import type { SubTaskStats } from '@/types/requests-list';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Ban,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SubTasksPanelProps {
  requestId: string;
}

export function SubTasksPanel({ requestId }: SubTasksPanelProps) {
  const router = useRouter();
  const { technicians, ticket, statuses, initialSubTasks } = useRequestDetail();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sectionId, setSectionId] = useState<string>('');
  const [technicianId, setTechnicianId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  // Check if current status is "count_as_solved"
  // IMPORTANT: Use ticket.status directly instead of looking up from statuses array
  // This prevents race condition where statuses array is empty on first render
  const isStatusSolved = ticket.status?.countAsSolved === true;

  // State for sub-tasks data
  // Note: Type cast needed due to type definitions mismatch between types/sub-task and lib/api/sub-tasks
  const [subTasksData, setSubTasksData] = useState<{ items: SubTask[]; total: number } | undefined>(
    initialSubTasks ? { items: initialSubTasks.items as unknown as SubTask[], total: initialSubTasks.total } : undefined
  );
  const [stats, setStats] = useState<SubTaskStats | undefined>(initialSubTasks?.stats as SubTaskStats | undefined);
  const [sections, setSections] = useState<ServiceSection[]>([]);

  // Track mounted state
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Check if initial sub-tasks data is empty - if so, we need to fetch on mount
  const hasRealSubTasksData = initialSubTasks && initialSubTasks.items && initialSubTasks.items.length > 0;
  const hasRealStatsData = initialSubTasks?.stats !== undefined;

  // Fetch sub-tasks on mount if no initial data, and set up polling for unsolved tickets
  useEffect(() => {
    if (!requestId) return;

    const fetchSubTasks = async () => {
      if (!isMountedRef.current) return;
      try {
        const data = await getSubTasksByRequest(requestId);
        if (isMountedRef.current) {
          setSubTasksData(data);
        }
      } catch (err) {
        console.error('Failed to fetch sub-tasks:', err);
      }
    };

    const fetchStats = async () => {
      if (!isMountedRef.current) return;
      try {
        const data = await getSubTaskStats(requestId);
        if (isMountedRef.current) {
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch sub-task stats:', err);
      }
    };

    // Fetch on mount if no real initial data
    if (!hasRealSubTasksData) {
      fetchSubTasks();
    }
    if (!hasRealStatsData) {
      fetchStats();
    }

    // Set up polling for unsolved tickets (every 5 minutes)
    if (!isStatusSolved) {
      const intervalId = setInterval(() => {
        fetchSubTasks();
        fetchStats();
      }, 300000);
      return () => clearInterval(intervalId);
    }
  }, [requestId, isStatusSolved, hasRealSubTasksData, hasRealStatsData]);

  // Fetch sections only when dialog opens
  useEffect(() => {
    if (!showCreateDialog) return;

    const fetchSections = async () => {
      try {
        const data = await getServiceSections(true, false, true);
        if (isMountedRef.current) {
          setSections(data);
        }
      } catch (err) {
        console.error('Failed to fetch service sections:', err);
      }
    };

    fetchSections();
  }, [showCreateDialog]);

  // Refresh function for after creating a sub-task
  const refreshSubTasks = useCallback(async () => {
    if (!requestId) return;
    try {
      const [tasksData, statsData] = await Promise.all([
        getSubTasksByRequest(requestId),
        getSubTaskStats(requestId),
      ]);
      setSubTasksData(tasksData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to refresh sub-tasks:', err);
    }
  }, [requestId]);

  const subTasks = subTasksData?.items || [];

  // Get filtered technicians based on selected section (with defensive array check)
  const availableTechnicians = sectionId && Array.isArray(sections)
    ? sections.find(s => s.id === parseInt(sectionId))?.technicians || []
    : [];

  // Handle section change - reset technician if not in new section
  const handleSectionChange = (value: string) => {
    setSectionId(value);

    // Clear technician if it's not in the new section's technicians list (with defensive array check)
    if (value && technicianId && Array.isArray(sections)) {
      const sectionTechs = sections.find(s => s.id === parseInt(value))?.technicians || [];
      const isTechInSection = sectionTechs.some(t => t.id === technicianId);
      if (!isTechInSection) {
        setTechnicianId(undefined);
      }
    }
  };

  const handleCreate = async () => {
    if (!title.trim() || title.trim().length < 5 || !sectionId) return;

    setIsLoading(true);
    try {
      const data: SubTaskCreate = {
        parentTaskId: requestId,
        title: title.trim(),
        description: description.trim().length >= 10 ? description.trim() : undefined,
        assignedToSectionId: parseInt(sectionId),
        assignedToTechnicianId: technicianId || undefined,
      };

      await createSubTask(requestId, data);

      // Refresh data
      await refreshSubTasks();

      setTitle('');
      setDescription('');
      setSectionId('');
      setTechnicianId(undefined);
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Failed to create sub-task:', error);
      alert('Failed to create sub-task. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubTaskClick = (subTaskId: string) => {
    // Navigate to the standard request details page since sub-tasks are full requests
    router.push(`/support-center/requests/${subTaskId}`);
  };

  const getStatusName = (statusId: number) => {
    // Safety check: ensure statuses is an array
    if (!Array.isArray(statuses)) {
      return 'Unknown';
    }
    const status = statuses.find(s => s.id === statusId);
    return status?.name || 'Unknown';
  };

  const getStatusColor = (statusId: number) => {
    switch (statusId) {
      case 3: // Completed
        return 'bg-green-100 text-green-800 border-green-300';
      case 2: // In Progress
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 1: // Open
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-orange-100 text-orange-800 border-orange-300';
    }
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-border/40">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-semibold">
            Sub-Tasks ({subTasks.length})
          </CardTitle>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreateDialog(true)}
          disabled={isStatusSolved}
          title={isStatusSolved ? "Cannot add sub-tasks to solved requests" : ""}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </CardHeader>

      {subTasks.length > 0 && (
        <CardContent className="pt-4">
          {/* Sub-tasks list */}
          <div className="space-y-3">
            {subTasks.map((subTask) => (
              <div
                key={subTask.id}
                onClick={() => handleSubTaskClick(subTask.id)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer group',
                  subTask.isBlocked
                    ? 'border-red-300 bg-red-50/70 hover:bg-red-50 hover:shadow-sm'
                    : 'border-border/60 bg-card hover:border-border hover:bg-muted/40 hover:shadow-sm'
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={cn(
                          'font-medium',
                          subTask.status?.id === 3 && 'line-through text-gray-500'
                        )}
                      >
                        {subTask.subject}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', getStatusColor(subTask.status?.id || 1))}
                      >
                        {subTask.status?.name || 'Unknown'}
                      </Badge>
                      {subTask.isBlocked && (
                        <Badge variant="destructive" className="text-xs">
                          <Ban className="h-3 w-3 mr-1" />
                          Blocked
                        </Badge>
                      )}
                    </div>

                    {subTask.blockedReason && (
                      <p className="text-sm text-red-600 mt-1">
                        Blocked: {subTask.blockedReason}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                      {subTask.dueDate && (
                        <span>
                          Due: {new Date(subTask.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      {subTask.estimatedHours && (
                        <span>Est: {subTask.estimatedHours}h</span>
                      )}
                      {subTask.actualHours && (
                        <span>Actual: {subTask.actualHours}h</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Sub-Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold mb-1.5">
                Title <span className="text-red-500">*</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter sub-task title (at least 5 characters)"
                maxLength={200}
                minLength={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {title.length}/200 characters {title.length > 0 && title.length < 5 && <span className="text-red-500">(minimum 5 required)</span>}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold mb-1.5">
                Description <span className="text-xs text-muted-foreground font-normal">(optional, min 10 characters)</span>
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter additional details (at least 10 characters if provided)..."
                rows={3}
                minLength={10}
              />
              {description.length > 0 && description.length < 10 && (
                <p className="text-xs text-red-500 mt-1">
                  {description.length}/10 characters (will not be saved)
                </p>
              )}
            </div>

            {/* Section Selection */}
            <div>
              <label className="block text-sm font-semibold mb-1.5">
                Section <span className="text-red-500">*</span>
              </label>
              <Select value={sectionId} onValueChange={handleSectionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.length > 0 ? (
                    sections.map((section) => (
                      <SelectItem key={section.id} value={section.id.toString()}>
                        {section.shownNameEn}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-sections" disabled>
                      No sections available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Technician Selection */}
            <div>
              <label className="block text-sm font-semibold mb-1.5">
                Assign Technician {sectionId && <span className="text-muted-foreground text-xs">(from selected section)</span>}
              </label>
              <Select
                value={technicianId}
                onValueChange={(value) => setTechnicianId(value === 'unassigned' ? undefined : value)}
                disabled={!sectionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={sectionId ? "Select a technician (optional)" : "Select a section first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {sectionId && availableTechnicians.length > 0 ? (
                    availableTechnicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.fullName || tech.username}
                      </SelectItem>
                    ))
                  ) : sectionId && availableTechnicians.length === 0 ? (
                    <SelectItem value="no-technicians" disabled>
                      No technicians assigned to this section
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              {!sectionId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Select a section to view available technicians
                </p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setTitle('');
                  setDescription('');
                  setSectionId('');
                  setTechnicianId(undefined);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!title.trim() || title.trim().length < 5 || !sectionId || isLoading}
              >
                {isLoading ? 'Creating...' : 'Create Sub-Task'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
