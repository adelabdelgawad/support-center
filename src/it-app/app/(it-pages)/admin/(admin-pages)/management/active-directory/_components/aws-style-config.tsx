"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Edit,
  Loader2,
  CheckCircle,
  Network,
  Server,
  Shield,
  Globe,
  Lock,
  User,
  FolderTree,
  Clock,
  Copy,
  Check,
  Settings,
  Plus,
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

function CopyableValue({ value, mono = false }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group flex items-center gap-1.5">
      <span className={mono ? "font-mono" : ""}>{value}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="rounded-md bg-muted p-2 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="text-sm font-medium mt-0.5">{children}</div>
      </div>
    </div>
  );
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
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <Card className="border-dashed max-w-lg w-full">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Network className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">
                No Active Directory Configuration
              </h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                Get started by creating your first Active Directory
                configuration. This will enable user synchronization and
                authentication.
              </p>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
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

  const [organizationalUnits, setOrganizationalUnits] = useState<string[]>(
    config.organizationalUnits ?? []
  );

  const handleOUsSaved = (updatedOUs: string[]) => {
    setOrganizationalUnits(updatedOUs);
  };

  const ouCount = organizationalUnits.length;

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <Server className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{config.name}</h1>
              <p className="text-sm text-muted-foreground">
                {config.domainName}
              </p>
            </div>
            {config.isActive && (
              <Badge className="ml-2 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
                <CheckCircle className="mr-1 h-3 w-3" />
                Active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
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
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Server
                  </p>
                  <p className="text-sm font-semibold mt-1 truncate">
                    {config.path}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
                  <Server className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Port
                  </p>
                  <p className="text-sm font-semibold mt-1">{config.port}</p>
                </div>
                <div className="rounded-lg bg-purple-100 dark:bg-purple-900/30 p-2">
                  <Globe className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Encryption
                  </p>
                  <p className="text-sm font-semibold mt-1">
                    {config.useSsl ? "SSL/TLS" : "None"}
                  </p>
                </div>
                <div
                  className={`rounded-lg p-2 ${
                    config.useSsl
                      ? "bg-green-100 dark:bg-green-900/30"
                      : "bg-amber-100 dark:bg-amber-900/30"
                  }`}
                >
                  <Shield
                    className={`h-4 w-4 ${
                      config.useSsl
                        ? "text-green-600 dark:text-green-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Synced OUs
                  </p>
                  <p className="text-sm font-semibold mt-1">
                    {ouCount} unit{ouCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 p-2">
                  <FolderTree className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detail Panels */}
        <div className="grid grid-cols-2 gap-6">
          {/* Connection & Authentication */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Connection & Authentication
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              <InfoRow icon={Server} label="Server Address">
                <CopyableValue value={config.path} />
              </InfoRow>
              <InfoRow icon={Globe} label="Port">
                {config.port}
              </InfoRow>
              <InfoRow icon={Shield} label="SSL/TLS">
                <Badge
                  variant={config.useSsl ? "default" : "secondary"}
                  className={
                    config.useSsl
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0"
                  }
                >
                  {config.useSsl ? "Enabled" : "Disabled"}
                </Badge>
              </InfoRow>
              <InfoRow icon={Lock} label="Password">
                {config.hasPassword ? (
                  <span className="text-muted-foreground tracking-widest">
                    ••••••••
                  </span>
                ) : (
                  <span className="text-destructive">Not set</span>
                )}
              </InfoRow>
            </CardContent>
          </Card>

          {/* Domain Configuration */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Domain Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              <InfoRow icon={Globe} label="Domain Name">
                <CopyableValue value={config.domainName} />
              </InfoRow>
              <InfoRow icon={User} label="Service Account">
                <CopyableValue value={config.ldapUsername} />
              </InfoRow>
              <InfoRow icon={FolderTree} label="Base DN">
                <CopyableValue value={config.baseDn} mono />
              </InfoRow>
            </CardContent>
          </Card>
        </div>

        {/* Organizational Units */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Organizational Units
              </CardTitle>
              <div className="flex items-center gap-3">
                {ouCount > 0 && (
                  <Badge variant="secondary" className="font-normal">
                    <CheckCircle className="mr-1.5 h-3 w-3 text-green-500" />
                    Synchronizing {ouCount} unit{ouCount !== 1 ? "s" : ""}
                  </Badge>
                )}
                <OUTreeDiscoveryDialog onSave={handleOUsSaved} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {organizationalUnits.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {organizationalUnits.map((ou) => (
                  <Badge
                    key={ou}
                    variant="secondary"
                    className="font-mono px-3 py-1.5"
                  >
                    <FolderTree className="mr-1.5 h-3 w-3" />
                    {ou}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed py-8 flex flex-col items-center text-center">
                <FolderTree className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  No organizational units selected
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use &quot;Manage AD OUs&quot; to select units for
                  synchronization
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Metadata Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Created {new Date(config.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Last updated {new Date(config.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
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
