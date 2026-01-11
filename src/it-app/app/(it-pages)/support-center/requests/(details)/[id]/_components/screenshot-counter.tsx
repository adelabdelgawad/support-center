'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Camera } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ScreenshotCounterProps {
  messages: any[];
}

export function ScreenshotCounter({ messages }: ScreenshotCounterProps) {
  const screenshotCount = useMemo(() => {
    return messages.filter((msg) => msg.isScreenshot === true).length;
  }, [messages]);

  if (screenshotCount === 0) {
    return null; // Don't show counter if no screenshots
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 text-sm">
          <Camera className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Screenshots:</span>
          <Badge variant="secondary">
            {screenshotCount}
          </Badge>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Total screenshots in this request</p>
      </TooltipContent>
    </Tooltip>
  );
}
