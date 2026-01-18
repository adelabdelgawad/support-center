'use client';

import { EntityViewSheet } from '@/components/settings';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatDate } from '@/lib/utils/date-formatting';
import { CircleDot, CheckCircle, XCircle, Calendar, Lock, Languages, Eye, CheckSquare } from 'lucide-react';
import type { RequestStatusResponse } from '@/types/request-statuses';

interface ViewRequestStatusSheetProps {
  status: RequestStatusResponse;
  onOpenChange?: (open: boolean) => void;
}

export function ViewRequestStatusSheet({
  status,
  onOpenChange,
}: ViewRequestStatusSheetProps) {
  return (
    <EntityViewSheet
      open={true}
      onOpenChange={onOpenChange ?? (() => {})}
      title="Request Status"
      description={`Viewing details for "${status.nameEn}"`}
      icon={CircleDot}
      size="md"
    >
      {/* Status Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Badge
          variant={status.isActive ? 'default' : 'secondary'}
          className="flex items-center gap-1"
        >
          {status.isActive ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <XCircle className="w-3 h-3" />
          )}
          {status.isActive ? 'Active' : 'Inactive'}
        </Badge>
        {status.readonly && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            System Status
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">ID: #{status.id}</span>
      </div>

      {/* Names & Color Card */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="h-4 w-4 text-primary" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs font-medium">Internal Name</Label>
            <div className="text-sm bg-muted px-3 py-2 rounded border font-mono">
              {status.name}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">English Name</Label>
              <div className="text-sm bg-muted px-3 py-2 rounded border font-medium">
                {status.nameEn}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">Arabic Name</Label>
              <div className="text-sm bg-muted px-3 py-2 rounded border font-medium" dir="rtl">
                {status.nameAr}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs font-medium">Color</Label>
            {status.color ? (
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded border"
                  style={{ backgroundColor: status.color }}
                />
                <span className="text-sm font-mono">{status.color}</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No color set</div>
            )}
          </div>

          {status.description && (
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">Description</Label>
              <div className="text-sm bg-muted px-3 py-2 rounded border">
                {status.description}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Card */}
      <Card className="border mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4 text-primary" />
            Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">Count as Solved</Label>
              <Badge
                variant={status.countAsSolved ? 'default' : 'secondary'}
                className="flex items-center gap-1 w-fit"
              >
                {status.countAsSolved ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">Visible to Requester</Label>
              <Badge
                variant={status.visibleOnRequesterPage ? 'default' : 'secondary'}
                className="flex items-center gap-1 w-fit"
              >
                <Eye className="w-3 h-3" />
                {status.visibleOnRequesterPage ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-4" />

      {/* Timestamps */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-primary" />
            Timestamps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">Created At</Label>
              <div className="text-sm">{formatDate(status.createdAt)}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">Updated At</Label>
              <div className="text-sm">{formatDate(status.updatedAt)}</div>
            </div>
          </div>
          {status.createdBy && (
            <div className="mt-4 space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">Created By</Label>
              <div className="text-sm">{status.createdBy}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </EntityViewSheet>
  );
}

export default ViewRequestStatusSheet;
