'use client';

import {
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

export function LoginHeader() {
  return (
    <CardHeader className="text-center px-4 sm:px-6 pt-6 pb-4">
      <CardTitle className="text-2xl sm:text-3xl">Login</CardTitle>
      <CardDescription className="text-sm sm:text-base mt-2">Enter your credentials</CardDescription>
    </CardHeader>
  );
}
