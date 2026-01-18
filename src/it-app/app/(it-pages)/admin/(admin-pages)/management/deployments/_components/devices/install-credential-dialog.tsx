'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ShieldCheck } from 'lucide-react';
import type { InstallCredentials, CredentialType } from '@/types/credential';

interface InstallCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceHostname: string;
  onSubmit: (credentials: InstallCredentials) => Promise<void>;
}

export function InstallCredentialDialog({
  open,
  onOpenChange,
  deviceHostname,
  onSubmit,
}: InstallCredentialDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [credentialType, setCredentialType] = useState<CredentialType>('domain_admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        username: username.trim(),
        password,
        credentialType,
      });
      // Reset form on success
      setUsername('');
      setPassword('');
      setCredentialType('domain_admin');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      if (!newOpen) {
        // Reset form when closing
        setUsername('');
        setPassword('');
        setCredentialType('domain_admin');
        setError(null);
      }
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Remote Installation Credentials
          </DialogTitle>
          <DialogDescription>
            Enter administrator credentials for remote access to{' '}
            <span className="font-medium text-foreground">{deviceHostname}</span>.
            These credentials are used for this installation only and are not stored.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="DOMAIN\admin or admin@domain.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
              autoComplete="username"
            />
            <p className="text-xs text-muted-foreground">
              Use domain format (DOMAIN\user) or UPN (user@domain.com)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="credentialType">Account Type</Label>
            <Select
              value={credentialType}
              onValueChange={(value) => setCredentialType(value as CredentialType)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="credentialType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domain_admin">Domain Administrator</SelectItem>
                <SelectItem value="local_admin">Local Administrator</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Installing...
                </>
              ) : (
                'Install NetSupport'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
