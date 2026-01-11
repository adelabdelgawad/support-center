'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

interface LoginFormProps {
  onSubmit: (username: string, password: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function LoginForm({ onSubmit, isLoading, error }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(username, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 w-full ltr" dir="ltr">
      {error && (
        <Alert variant="destructive" className="text-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="username" className="text-sm sm:text-base">Username</Label>
        <Input
          id="username"
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isLoading}
          autoComplete="username"
          autoFocus
          className="h-11 sm:h-10 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm sm:text-base">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          autoComplete="current-password"
          className="h-11 sm:h-10 text-base"
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        size="lg"
        className="w-full mt-6 h-12 sm:h-11 text-base sm:text-lg"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Logging in...
          </>
        ) : (
          'Login'
        )}
      </Button>
    </form>
  );
}
