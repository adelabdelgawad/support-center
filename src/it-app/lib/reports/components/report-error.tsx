"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface ReportErrorProps {
  message: string;
}

/**
 * Standardized error display for reports
 */
export function ReportError({ message }: ReportErrorProps) {
  return (
    <Card className="border-destructive">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span>{message}</span>
        </div>
      </CardContent>
    </Card>
  );
}
