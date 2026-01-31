"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Edit,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Mail,
} from "lucide-react";
import type { EmailConfig } from "@/types/email-config";
import { AddEmailConfigSheet } from "./modal/add-email-config-sheet";
import { EditEmailConfigSheet } from "./modal/edit-email-config-sheet";
import { testEmailConnection } from "@/lib/api/email-config";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EmailConfigPageProps {
  initialConfig: EmailConfig | null;
}

export function EmailConfigPage({ initialConfig }: EmailConfigPageProps) {
  const [config, setConfig] = useState<EmailConfig | null>(initialConfig);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const handleConfigUpdate = (updated: EmailConfig) => {
    setConfig(updated);
    setEditOpen(false);
    toast.success("Configuration updated successfully");
  };

  const handleConfigCreate = (created: EmailConfig) => {
    setConfig(created);
    setAddOpen(false);
    toast.success("Configuration created successfully");
  };

  const handleSendTestEmail = async () => {
    if (!config || !testEmail) return;

    setTesting(true);
    try {
      const result = await testEmailConnection(config.id, {
        recipient: testEmail,
      });

      if (result.success) {
        toast.success(result.message || "Test email sent successfully");
        setTestDialogOpen(false);
        setTestEmail("");
      } else {
        toast.error(result.message || "Failed to send test email", {
          description: result.details,
        });
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send test email");
    } finally {
      setTesting(false);
    }
  };

  if (!config) {
    return (
      <>
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          {/* Page Header */}
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Email Configuration
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure SMTP settings for sending emails from the application
            </p>
          </div>

          {/* No Configuration State */}
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Mail className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">
                No Email Configuration
              </h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                Get started by creating your first email configuration. This
                will enable email notifications and alerts.
              </p>
              <Button onClick={() => setAddOpen(true)}>
                Create Configuration
              </Button>
            </CardContent>
          </Card>
        </div>

        <AddEmailConfigSheet
          open={addOpen}
          onOpenChange={setAddOpen}
          onSuccess={handleConfigCreate}
        />
      </>
    );
  }

  return (
    <>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Email Configuration
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage SMTP settings for application emails
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setTestDialogOpen(true)}
              disabled={testing}
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Test Email
                </>
              )}
            </Button>
            <Button onClick={() => setEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>

        {/* Configuration Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{config.name}</CardTitle>
                <CardDescription className="mt-1.5">
                  SMTP configuration for {config.smtpHost}
                </CardDescription>
              </div>
              {config.isActive && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Active
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Connection Details */}
            <div>
              <h3 className="text-sm font-medium mb-3">Connection</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">SMTP Host</span>
                  <p className="font-medium mt-1">{config.smtpHost}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Port</span>
                  <p className="font-medium mt-1">{config.smtpPort}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">TLS/STARTTLS</span>
                  <p className="font-medium mt-1">
                    {config.smtpTls ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Password</span>
                  <p className="font-medium mt-1">
                    {config.hasPassword ? "••••••••" : "Not set"}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Authentication */}
            <div>
              <h3 className="text-sm font-medium mb-3">Authentication</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Username</span>
                  <p className="font-medium mt-1">{config.smtpUser}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">From Address</span>
                  <p className="font-medium mt-1">{config.smtpFrom}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Metadata */}
            <div>
              <h3 className="text-sm font-medium mb-3">Metadata</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p className="font-medium mt-1">
                    {new Date(config.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Updated</span>
                  <p className="font-medium mt-1">
                    {new Date(config.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Sheet */}
      <EditEmailConfigSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        config={config}
        onSuccess={handleConfigUpdate}
      />

      {/* Test Email Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send a test email to verify your SMTP configuration is working
              correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="test-email">Recipient Email Address</Label>
              <Input
                id="test-email"
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTestDialogOpen(false);
                setTestEmail("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendTestEmail}
              disabled={!testEmail || testing}
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Test Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
