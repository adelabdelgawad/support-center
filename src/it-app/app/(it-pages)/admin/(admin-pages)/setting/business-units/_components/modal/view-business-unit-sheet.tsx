'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { BusinessUnitResponse } from '@/types/business-units';
import type { BusinessUnitRegionResponse } from '@/types/business-unit-regions';
import { formatDate } from '@/lib/utils/date-formatting';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, MessageSquare } from 'lucide-react';
import type { WorkingHours } from '@/types/business-units';

interface ViewBusinessUnitSheetProps {
  unit: BusinessUnitResponse;
  regions: BusinessUnitRegionResponse[];
  onOpenChange?: (open: boolean) => void;
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function ViewBusinessUnitSheet({
  unit,
  regions,
  onOpenChange,
}: ViewBusinessUnitSheetProps) {
  const getRegionName = (regionId?: number | null) => {
    if (!regionId) return 'Unknown';
    return regions.find((r) => r.id === regionId)?.name || 'Unknown';
  };

  const renderWorkingHours = (workingHours: WorkingHours | null | undefined) => {
    if (!workingHours || Object.keys(workingHours).length === 0) {
      return <p className="text-sm text-muted-foreground italic">No working hours configured</p>;
    }

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    return (
      <div className="space-y-2">
        {days.map((day) => {
          const dayHours = workingHours[day as keyof WorkingHours];
          const isConfigured = dayHours && dayHours.length > 0;

          return (
            <div key={day} className="flex justify-between items-center py-2 border-b last:border-0">
              <span className="font-medium capitalize">{DAY_LABELS[day]}</span>
              <span className={isConfigured ? "text-sm" : "text-sm text-muted-foreground italic"}>
                {isConfigured
                  ? dayHours.map((range, idx) =>
                      `${range.from} — ${range.to}`
                    ).join(', ')
                  : 'Off-shift'}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Business Unit Details</SheetTitle>
          <SheetDescription>View business unit information</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Name</h3>
            <p className="mt-1 text-base font-medium">{unit.name}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Region</h3>
            <p className="mt-1 text-base">{getRegionName(unit.businessUnitRegionId)}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Network</h3>
            <p className="mt-1 text-base text-gray-900">
              {unit.network || '—'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Description</h3>
            <p className="mt-1 text-base text-gray-900">
              {unit.description || '—'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Status</h3>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant={unit.isActive ? 'default' : 'secondary'}
                className={unit.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
              >
                {unit.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          {/* Working Hours Section */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-base">Working Hours</h3>
            </div>
            <Card>
              <CardContent className="pt-6">
                {renderWorkingHours(unit.workingHours)}
              </CardContent>
            </Card>
          </div>

          {/* WhatsApp Configuration Section */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-base">WhatsApp Out-of-Shift Escalation</h3>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500">WhatsApp Group Name</h3>
                <p className="mt-1 text-base">{unit.whatsappGroupName || '—'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">WhatsApp Group ID</h3>
                <p className="mt-1 text-sm font-mono break-all">
                  {unit.whatsappGroupId || '—'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Periodic Send Interval</h3>
                <p className="mt-1 text-base">
                  {unit.whatsappOutshiftIntervalMinutes
                    ? `${unit.whatsappOutshiftIntervalMinutes} minutes`
                    : '30 minutes (default)'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created At</h3>
              <p className="mt-1 text-sm">
                {formatDate(unit.createdAt)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Updated At</h3>
              <p className="mt-1 text-sm">
                {formatDate(unit.updatedAt)}
              </p>
            </div>
          </div>

          {unit.createdBy && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created By</h3>
              <p className="mt-1 text-sm">{unit.createdBy}</p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ViewBusinessUnitSheet;
