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
  Network,
} from "lucide-react";
import type { ActiveDirectoryConfig } from "@/types/active-directory-config";
import { AddADConfigSheet } from "./modal/add-ad-config-sheet";
import { EditADConfigSheet } from "./modal/edit-ad-config-sheet";
import { OUTreeDiscoveryDialog } from "./ou-management/ou-tree-discovery-dialog";
import { testADConnection } from "@/lib/api/active-directory-config";
import { toast } from "sonner";

interface AWSStyleConfigProps {
  initialConfig: ActiveDirectoryConfig | null;
}

export function AWSStyleConfig({ initialConfig }: AWSStyleConfigProps) {
  const [config, setConfig] = useState<ActiveDirectoryConfig | null>(
    initialConfig
  );
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleConfigUpdate = (updated: ActiveDirectoryConfig) => {
    setConfig(updated);
    setEditOpen(false);
    toast.success("Configuration updated successfully");
  };

  const handleConfigCreate = (created: ActiveDirectoryConfig) => {
    setConfig(created);
    setAddOpen(false);
    toast.success("Configuration created successfully");
  };

  const handleTestConnection = async () => {
    if (!config) return;

    setTesting(true);
    try {
      const result = await testADConnection(config.id);

      if (result.success) {
        toast.success(result.message || "Connection successful");
      } else {
        toast.error(result.message || "Connection failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to test connection");
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
              Active Directory
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure Active Directory integration for user synchronization
            </p>
          </div>

          {/* No Configuration State */}
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Network className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">
                No Active Directory Configuration
              </h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                Get started by creating your first Active Directory configuration. This
                will enable user synchronization and authentication.
              </p>
              <Button onClick={() => setAddOpen(true)}>
                Create Configuration
              </Button>
            </CardContent>
          </Card>
        </div>

        <AddADConfigSheet
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
              Active Directory Configuration
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage Active Directory integration settings
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing}
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Network className="mr-2 h-4 w-4" />
                  Test Connection
                </>
              )}
            </Button>
            <OUTreeDiscoveryDialog />
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
                  Active Directory configuration for {config.domainName}
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
                  <span className="text-muted-foreground">Server Address</span>
                  <p className="font-medium mt-1">{config.path}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Port</span>
                  <p className="font-medium mt-1">{config.port}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">SSL/TLS</span>
                  <p className="font-medium mt-1">
                    {config.useSsl ? "Enabled" : "Disabled"}
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

            {/* Domain Configuration */}
            <div>
              <h3 className="text-sm font-medium mb-3">Domain Configuration</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Domain Name</span>
                  <p className="font-medium mt-1">{config.domainName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">LDAP Username</span>
                  <p className="font-medium mt-1">{config.ldapUsername}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Base DN</span>
                  <p className="font-medium font-mono mt-1 break-all">
                    {config.baseDn}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Organizational Units */}
            <div>
              <h3 className="text-sm font-medium mb-3">Organizational Units</h3>
              {config.desiredOus && config.desiredOus.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Synchronizing {config.desiredOus.length} organizational unit
                    {config.desiredOus.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {config.desiredOus.map((ou) => (
                      <Badge key={ou} variant="secondary" className="font-mono">
                        {ou}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No organizational units selected. Use &quot;Manage OUs&quot; to
                  select units for synchronization.
                </p>
              )}
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

      <EditADConfigSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        config={config}
        onSuccess={handleConfigUpdate}
      />
    </>
  );
}
