'use client';

import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AuthCardProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function AuthCard({ children, footer, className }: AuthCardProps) {
  return (
    <Card
      className={cn(
        'w-full min-w-[400px] max-w-[450px] border-border/50',
        className
      )}
    >
      <CardContent className="flex flex-col items-center pt-8">
        {children}
      </CardContent>
      {footer && (
        <CardFooter className="flex-col border-t border-border/50 pt-6">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}
