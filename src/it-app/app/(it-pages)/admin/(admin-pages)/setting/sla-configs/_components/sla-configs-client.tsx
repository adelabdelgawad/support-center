'use client';

import { useState, useCallback, useEffect } from 'react';
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
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/date-formatting';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// API functions
const listSLAConfigs = async () => {
  const response = await fetch('/api/sla-configs', {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch SLA configs');
  return response.json();
};

const createSLAConfig = async (data: any) => {
  const response = await fetch('/api/sla-configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create SLA config');
  return response.json();
};

const updateSLAConfig = async (id: number, data: any) => {
  const response = await fetch(`/api/sla-configs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update SLA config');
  return response.json();
};

const deleteSLAConfig = async (id: number) => {
  const response = await fetch(`/api/sla-configs/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to delete SLA config');
};

interface SLAConfig {
  id: number;
  priorityId: number;
  priorityName?: string;
  categoryId?: number | null;
  categoryName?: string | null;
  businessUnitId?: number | null;
  businessUnitName?: string | null;
  firstResponseMinutes: number;
  resolutionHours: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const formSchema = z.object({
  priorityId: z.number().min(1, 'Priority is required'),
  categoryId: z.number().optional().nullable(),
  businessUnitId: z.number().optional().nullable(),
  firstResponseMinutes: z.number().min(1, 'Must be at least 1 minute'),
  resolutionHours: z.number().min(1, 'Must be at least 1 hour'),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

export default function SLAConfigsClient() {
  // Simple state management (useState instead of SWR)
  const [configs, setConfigs] = useState<SLAConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SLAConfig | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  /**
   * Manual refresh function
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listSLAConfigs();
      setConfigs(response);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial data fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priorityId: 0,
      categoryId: null,
      businessUnitId: null,
      firstResponseMinutes: 60,
      resolutionHours: 24,
      isActive: true,
    },
  });

  const handleCreate = async (data: FormData) => {
    try {
      const newConfig = await createSLAConfig(data);
      setConfigs((prev) => [...prev, newConfig]);
      setIsCreateDialogOpen(false);
      form.reset();
    } catch (error) {
      console.error('Failed to create SLA config:', error);
    }
  };

  const handleEdit = async (data: FormData) => {
    if (!editingConfig) return;

    try {
      const updatedConfig = await updateSLAConfig(editingConfig.id, data);
      setConfigs((prev) =>
        prev.map((c) => (c.id === editingConfig.id ? updatedConfig : c))
      );
      setEditingConfig(null);
      form.reset();
    } catch (error) {
      console.error('Failed to update SLA config:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSLAConfig(id);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
      setDeletingId(null);
    } catch (error) {
      console.error('Failed to delete SLA config:', error);
    }
  };

  const openEditDialog = (config: SLAConfig) => {
    setEditingConfig(config);
    form.reset({
      priorityId: config.priorityId,
      categoryId: config.categoryId,
      businessUnitId: config.businessUnitId,
      firstResponseMinutes: config.firstResponseMinutes,
      resolutionHours: config.resolutionHours,
      isActive: config.isActive,
    });
  };

  const getScopeDescription = (config: SLAConfig) => {
    const parts = [];
    if (config.priorityName) parts.push(config.priorityName);
    if (config.categoryName) parts.push(config.categoryName);
    if (config.businessUnitName) parts.push(config.businessUnitName);
    return parts.join(' → ') || 'All';
  };

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load SLA configurations. Please try again later.
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
          <h1 className="text-3xl font-bold">SLA Configurations</h1>
          <p className="text-muted-foreground">
            Manage Service Level Agreement rules and targets
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New SLA Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create SLA Configuration</DialogTitle>
              <DialogDescription>
                Define SLA targets for specific priorities, categories, or business units
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="priorityId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority *</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">Critical</SelectItem>
                            <SelectItem value="2">High</SelectItem>
                            <SelectItem value="3">Medium</SelectItem>
                            <SelectItem value="4">Low</SelectItem>
                            <SelectItem value="5">Lowest</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category (Optional)</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(value === 'null' ? null : parseInt(value))
                          }
                          value={field.value?.toString() || 'null'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="All categories" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="null">All categories</SelectItem>
                            {/* Add actual categories from API */}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Leave empty for all categories
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="businessUnitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Unit (Optional)</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === 'null' ? null : parseInt(value))
                        }
                        value={field.value?.toString() || 'null'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="All business units" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">All business units</SelectItem>
                          {/* Add actual business units from API */}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Leave empty for all business units
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstResponseMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Response Time (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Target for first technician response
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="resolutionHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resolution Time (hours)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Target for ticket resolution
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Enable this SLA rule
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Create</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            SLA Hierarchy
          </CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 text-sm space-y-2">
          <p>
            SLA rules are applied in order of specificity (most specific first):
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Priority + Category + Business Unit</li>
            <li>Priority + Category</li>
            <li>Priority + Business Unit</li>
            <li>Priority only</li>
            <li>Default (from Priority table)</li>
          </ol>
          <p className="mt-2 italic">
            More specific rules override general ones. Create targeted rules for special cases.
          </p>
        </CardContent>
      </Card>

      {/* Configs Table */}
      <Card>
        <CardHeader>
          <CardTitle>SLA Rules</CardTitle>
          <CardDescription>
            Active and inactive SLA configurations
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
                  <TableHead>Scope</TableHead>
                  <TableHead>First Response</TableHead>
                  <TableHead>Resolution</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <div className="font-medium">{getScopeDescription(config)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {config.firstResponseMinutes} min
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {config.resolutionHours} hrs
                      </div>
                    </TableCell>
                    <TableCell>
                      {config.isActive ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDate(config.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
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
              No SLA configurations yet. Create your first SLA rule to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog - similar structure to create dialog */}
      <Dialog open={!!editingConfig} onOpenChange={() => setEditingConfig(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit SLA Configuration</DialogTitle>
            <DialogDescription>
              Update SLA targets and settings
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleEdit)} className="space-y-4">
              {/* Same form fields as create - omitted for brevity */}
              <div className="text-sm text-muted-foreground">
                Form fields same as create dialog...
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingConfig(null)}
                >
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
            <DialogTitle>Delete SLA Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this SLA rule? This action cannot be undone.
              Tickets will fall back to the next applicable SLA rule.
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
