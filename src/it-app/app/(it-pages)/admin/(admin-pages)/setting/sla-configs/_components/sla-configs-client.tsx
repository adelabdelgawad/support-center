'use client';

import { useState } from 'react';
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
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
import {
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/date-formatting';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toastSuccess, toastError } from '@/lib/toast';
import { createSLAConfig, updateSLAConfig, deleteSLAConfig } from '@/lib/api/sla-configs';
import type { SLAConfigResponse } from '@/types/sla-configs';
import type { Priority } from '@/types/metadata';
import type { CategoryResponse } from '@/types/categories';
import type { BusinessUnitResponse } from '@/types/business-units';

const formSchema = z.object({
  priorityId: z.number().min(1, 'Priority is required'),
  categoryId: z.number().optional().nullable(),
  businessUnitId: z.number().optional().nullable(),
  firstResponseMinutes: z.number().min(1, 'Must be at least 1 minute'),
  resolutionHours: z.number().min(1, 'Must be at least 1 hour'),
  businessHoursOnly: z.boolean(),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface SLAConfigsClientProps {
  initialData: SLAConfigResponse[];
  priorities: Priority[];
  categories: CategoryResponse[];
  businessUnits: BusinessUnitResponse[];
}

interface SLAFormFieldsProps {
  form: ReturnType<typeof useForm<FormData>>;
  priorities: Priority[];
  categories: CategoryResponse[];
  businessUnits: BusinessUnitResponse[];
}

function SLAFormFields({ form, priorities, categories, businessUnits }: SLAFormFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 items-start">
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
                  {priorities.map((priority) => (
                    <SelectItem key={priority.id} value={priority.id.toString()}>
                      {priority.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription className="opacity-0">Hidden spacer</FormDescription>
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
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
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
                {businessUnits.map((bu) => (
                  <SelectItem key={bu.id} value={bu.id.toString()}>
                    {bu.name}
                  </SelectItem>
                ))}
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
        name="businessHoursOnly"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="text-base">Business Hours Only</FormLabel>
              <FormDescription>
                Calculate SLA targets during business hours only
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
    </>
  );
}

export default function SLAConfigsClient({
  initialData,
  priorities,
  categories,
  businessUnits,
}: SLAConfigsClientProps) {
  const [configs, setConfigs] = useState<SLAConfigResponse[]>(initialData);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SLAConfigResponse | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<SLAConfigResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const createForm = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priorityId: 0,
      categoryId: null,
      businessUnitId: null,
      firstResponseMinutes: 60,
      resolutionHours: 24,
      businessHoursOnly: true,
      isActive: true,
    },
  });

  const editForm = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      priorityId: 0,
      categoryId: null,
      businessUnitId: null,
      firstResponseMinutes: 60,
      resolutionHours: 24,
      businessHoursOnly: true,
      isActive: true,
    },
  });

  const handleCreate = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const newConfig = await createSLAConfig({
        priorityId: data.priorityId,
        categoryId: data.categoryId,
        businessUnitId: data.businessUnitId,
        firstResponseMinutes: data.firstResponseMinutes,
        resolutionHours: data.resolutionHours,
        businessHoursOnly: data.businessHoursOnly,
      });
      setConfigs((prev) => [...prev, newConfig]);
      setIsCreateSheetOpen(false);
      createForm.reset();
      toastSuccess('SLA configuration created successfully');
    } catch (error) {
      console.error('Failed to create SLA config:', error);
      toastError(error instanceof Error ? error.message : 'Failed to create SLA configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: FormData) => {
    if (!editingConfig) return;

    setIsSubmitting(true);
    try {
      const updatedConfig = await updateSLAConfig(editingConfig.id, {
        priorityId: data.priorityId,
        categoryId: data.categoryId,
        businessUnitId: data.businessUnitId,
        firstResponseMinutes: data.firstResponseMinutes,
        resolutionHours: data.resolutionHours,
        businessHoursOnly: data.businessHoursOnly,
        isActive: data.isActive,
      });
      setConfigs((prev) =>
        prev.map((c) => (c.id === editingConfig.id ? updatedConfig : c))
      );
      setEditingConfig(null);
      editForm.reset();
      toastSuccess('SLA configuration updated successfully');
    } catch (error) {
      console.error('Failed to update SLA config:', error);
      toastError(error instanceof Error ? error.message : 'Failed to update SLA configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingConfig) return;

    setIsSubmitting(true);
    try {
      await deleteSLAConfig(deletingConfig.id);
      setConfigs((prev) => prev.filter((c) => c.id !== deletingConfig.id));
      setDeletingConfig(null);
      toastSuccess('SLA configuration deleted successfully');
    } catch (error) {
      console.error('Failed to delete SLA config:', error);
      toastError(error instanceof Error ? error.message : 'Failed to delete SLA configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (config: SLAConfigResponse) => {
    setEditingConfig(config);
    editForm.reset({
      priorityId: config.priorityId,
      categoryId: config.categoryId,
      businessUnitId: config.businessUnitId,
      firstResponseMinutes: config.firstResponseMinutes,
      resolutionHours: config.resolutionHours,
      businessHoursOnly: config.businessHoursOnly,
      isActive: config.isActive,
    });
  };

  const getScopeDescription = (config: SLAConfigResponse) => {
    const parts = [];
    if (config.priority?.name) parts.push(config.priority.name);
    if (config.category?.name) parts.push(config.category.name);
    if (config.businessUnit?.name) parts.push(config.businessUnit.name);
    return parts.join(' → ') || 'All';
  };

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
        <div className="flex items-center gap-2">
          <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
            <Button variant="outline" size="icon" onClick={() => setIsHelpOpen(true)}>
              <HelpCircle className="h-4 w-4" />
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>SLA Hierarchy</DialogTitle>
                <DialogDescription>
                  SLA rules are applied in order of specificity (most specific first):
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <ol className="list-decimal list-inside space-y-1 ml-2 text-sm">
                  <li>Priority + Category + Business Unit</li>
                  <li>Priority + Category</li>
                  <li>Priority + Business Unit</li>
                  <li>Priority only</li>
                  <li>Default (from Priority table)</li>
                </ol>
                <p className="text-sm text-muted-foreground italic">
                  More specific rules override general ones. Create targeted rules for special cases.
                </p>
              </div>
            </DialogContent>
          </Dialog>
        <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
          <SheetTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New SLA Rule
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Create SLA Configuration</SheetTitle>
              <SheetDescription>
                Define SLA targets for specific priorities, categories, or business units
              </SheetDescription>
            </SheetHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4 p-4">
                <SLAFormFields
                  form={createForm}
                  priorities={priorities}
                  categories={categories}
                  businessUnits={businessUnits}
                />
                <SheetFooter>
                  <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateSheetOpen(false)}
                      disabled={isSubmitting}
                      className="flex-1 sm:flex-none min-w-[120px] h-10"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 sm:flex-none min-w-[120px] h-10"
                    >
                      {isSubmitting ? (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Create SLA Rule
                        </>
                      )}
                    </Button>
                  </div>
                </SheetFooter>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
        </div>
      </div>

      {/* Configs Table */}
      <Card>
        <CardHeader>
          <CardTitle>SLA Rules</CardTitle>
          <CardDescription>
            Active and inactive SLA configurations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>First Response</TableHead>
                  <TableHead>Resolution</TableHead>
                  <TableHead>Business Hours</TableHead>
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
                      {config.businessHoursOnly ? (
                        <Badge variant="outline">Business Hours</Badge>
                      ) : (
                        <Badge variant="secondary">24/7</Badge>
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
                          onClick={() => setDeletingConfig(config)}
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

      {/* Edit Dialog */}
      <Dialog open={!!editingConfig} onOpenChange={() => setEditingConfig(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit SLA Configuration</DialogTitle>
            <DialogDescription>
              Update SLA targets and settings
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <SLAFormFields
                form={editForm}
                priorities={priorities}
                categories={categories}
                businessUnits={businessUnits}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingConfig(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Updating...' : 'Update'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingConfig} onOpenChange={() => setDeletingConfig(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete SLA Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this SLA rule? This action cannot be undone.
              Tickets will fall back to the next applicable SLA rule.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingConfig(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
