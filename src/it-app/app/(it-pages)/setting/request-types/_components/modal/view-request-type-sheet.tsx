'use client';

import { EntityViewSheet } from '@/components/settings';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { formatDate } from '@/lib/utils/date-formatting';
import { FileType, CheckCircle, XCircle, Calendar, Hash, Languages } from 'lucide-react';
import type { RequestType } from '@/types/request-types';

interface ViewRequestTypeSheetProps {
  type: RequestType;
  onOpenChange?: (open: boolean) => void;
}

export function ViewRequestTypeSheet({
  type,
  onOpenChange,
}: ViewRequestTypeSheetProps) {
  return (
    <EntityViewSheet
      open={true}
      onOpenChange={onOpenChange ?? (() => {})}
      title="Request Type"
      description={`Viewing details for "${type.nameEn}"`}
      icon={FileType}
      size="md"
    >
      {/* Status Badge */}
      <div className="flex items-center gap-2 mb-6">
        <Badge
          variant={type.isActive ? 'default' : 'secondary'}
          className="flex items-center gap-1"
        >
          {type.isActive ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <XCircle className="w-3 h-3" />
          )}
          {type.isActive ? 'Active' : 'Inactive'}
        </Badge>
        <span className="text-sm text-muted-foreground">ID: #{type.id}</span>
      </div>

      {/* Names Card */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="h-4 w-4 text-primary" />
            Names
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">English Name</Label>
              <div className="text-sm bg-muted px-3 py-2 rounded border font-medium">
                {type.nameEn}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">Arabic Name</Label>
              <div className="text-sm bg-muted px-3 py-2 rounded border font-medium" dir="rtl">
                {type.nameAr}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Descriptions Card */}
      {(type.briefEn || type.briefAr) && (
        <Card className="border mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Hash className="h-4 w-4 text-primary" />
              Descriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {type.briefEn && (
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs font-medium">English Description</Label>
                <div className="text-sm bg-muted px-3 py-2 rounded border">
                  {type.briefEn}
                </div>
              </div>
            )}
            {type.briefAr && (
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs font-medium">Arabic Description</Label>
                <div className="text-sm bg-muted px-3 py-2 rounded border" dir="rtl">
                  {type.briefAr}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
              <div className="text-sm">{formatDate(type.createdAt)}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs font-medium">Updated At</Label>
              <div className="text-sm">{formatDate(type.updatedAt)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </EntityViewSheet>
  );
}

export default ViewRequestTypeSheet;
