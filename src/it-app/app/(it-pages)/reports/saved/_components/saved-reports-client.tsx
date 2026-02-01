'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAsyncData } from '@/lib/hooks/use-async-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  Globe,
  Lock,
  PlayCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { formatShortDateTime } from '@/lib/utils/date-formatting';
import {
  listReportConfigs,
  createReportConfig,
  updateReportConfig,
  deleteReportConfig
} from '@/lib/api/reports';
import { ReportConfig, ReportType } from '@/types/reports';

const reportTypes: { value: ReportType; label: string }[] = [
  { value: 'executive_dashboard', label: 'Executive Dashboard' },
  { value: 'operations_dashboard', label: 'Operations Dashboard' },
  { value: 'sla_compliance', label: 'SLA Compliance' },
  { value: 'agent_performance', label: 'Agent Performance' },
  { value: 'volume_analysis', label: 'Volume Analysis' },
  { value: 'category_breakdown', label: 'Category Breakdown' },
  { value: 'custom', label: 'Custom' },
];

const formSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  reportType: z.enum([
    'executive',
    'executive_dashboard',
    'operations_dashboard',
    'agent_performance',
    'sla_compliance',
    'volume',
    'volume_analysis',
    'category_analysis',
    'category_breakdown',
    'business_unit',
    'custom',
  ]),
  isPublic: z.boolean(),
  isActive: z.boolean(),
  filterConfig: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function SavedReportsClient() {
  const router = useRouter();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ReportConfig | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchConfigs = async () => {
    return await listReportConfigs({});
  };

  const { data, error, isLoading, refetch } = useAsyncData<ReportConfig[]>(
    fetchConfigs,
    [],
    undefined
  );

  // Use data directly from SWR hook instead of duplicating in state
  const configs = data ?? [];

  // Refetch configs from server after mutations
  const refreshConfigs = useCallback(() => {
    refetch();
  }, [refetch]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      reportType: 'executive_dashboard',
      isPublic: false,
      isActive: true,
      filterConfig: '{}',
    },
  });

  const handleCreate = async (data: FormData) => {
    try {
      const response = await createReportConfig({
        name: data.name,
        description: data.description || undefined,
        reportType: data.reportType,
        isPublic: data.isPublic,
        isActive: data.isActive,
        filterConfig: data.filterConfig ? JSON.parse(data.filterConfig) : {},
      });
      setIsCreateDialogOpen(false);
      form.reset();
      refreshConfigs();
    } catch (error) {
      console.error('Failed to create report config:', error);
    }
  };

  const handleEdit = async (data: FormData) => {
    if (!editingConfig) return;

    try {
      await updateReportConfig(editingConfig.id, {
        name: data.name,
        description: data.description || undefined,
        reportType: data.reportType,
        isPublic: data.isPublic,
        isActive: data.isActive,
        filterConfig: data.filterConfig ? JSON.parse(data.filterConfig) : {},
      });
      setEditingConfig(null);
      form.reset();
      refreshConfigs();
    } catch (error) {
      console.error('Failed to update report config:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteReportConfig(id);
      setDeletingId(null);
      refreshConfigs();
    } catch (error) {
      console.error('Failed to delete report config:', error);
    }
  };

  const openEditDialog = (config: ReportConfig) => {
    setEditingConfig(config);
    form.reset({
      name: config.name,
      description: config.description || '',
      reportType: config.reportType,
      isPublic: config.isPublic,
      isActive: config.isActive,
      filterConfig: JSON.stringify(config.filters || {}, null, 2),
    });
  };

  const handleRunReport = (config: ReportConfig) => {
    // Navigate to the appropriate report page based on type
    const routeMap: Record<ReportType, string> = {
      executive: '/reports',
      executive_dashboard: '/reports',
      operations_dashboard: '/reports/operations',
      sla_compliance: '/reports/sla',
      agent_performance: '/reports/agents',
      volume: '/reports/volume',
      volume_analysis: '/reports/volume',
      category_analysis: '/reports',
      category_breakdown: '/reports',
      business_unit: '/reports',
      custom: '/reports',
    };

    router.push(routeMap[config.reportType] || '/reports');
  };

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load saved reports. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Saved Reports</h1>
          <p className="text-muted-foreground">
            Manage saved report configurations and scheduled reports
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Report Config
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Report Configuration</DialogTitle>
              <DialogDescription>
                Save a report configuration for quick access or scheduling
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Weekly Executive Summary" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional description of this report"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reportType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Report Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {reportTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="filterConfig"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Filter Configuration (JSON)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='{"businessUnitIds": [1, 2], "datePreset": "last_30_days"}'
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        JSON object with report filters (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isPublic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Public</FormLabel>
                        <FormDescription>
                          Allow other users to view this report configuration
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Enable this report configuration
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Configs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Report Configurations</CardTitle>
          <CardDescription>
            Manage your saved report configurations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{config.name}</div>
                        {config.description && (
                          <div className="text-sm text-muted-foreground">
                            {config.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {reportTypes.find((t) => t.value === config.reportType)?.label ||
                        config.reportType}
                    </TableCell>
                    <TableCell>
                      {config.isPublic ? (
                        <Badge variant="secondary">
                          <Globe className="h-3 w-3 mr-1" />
                          Public
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Lock className="h-3 w-3 mr-1" />
                          Private
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {config.isActive ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {config.lastRunAt
                        ? formatShortDateTime(config.lastRunAt)
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRunReport(config)}
                        >
                          <PlayCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDialog(config)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeletingId(config.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No saved reports yet. Create your first report configuration to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingConfig} onOpenChange={() => setEditingConfig(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Report Configuration</DialogTitle>
            <DialogDescription>
              Update the report configuration settings
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleEdit)} className="space-y-4">
              {/* Same form fields as create dialog */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reportType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Report Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {reportTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="filterConfig"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Filter Configuration (JSON)</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isPublic"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Public</FormLabel>
                      <FormDescription>
                        Allow other users to view this report configuration
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Enable this report configuration
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingConfig(null)}>
                  Cancel
                </Button>
                <Button type="submit">Update</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Report Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this report configuration? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && handleDelete(deletingId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
