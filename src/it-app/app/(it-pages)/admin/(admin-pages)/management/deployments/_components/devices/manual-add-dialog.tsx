"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ManualAddRequest, Device, DeviceListItem } from "@/types/device";

interface ManualAddDialogProps {
  onSuccess: (devices?: DeviceListItem[]) => void;
  disabled?: boolean;
}

export function ManualAddDialog({ onSuccess, disabled }: ManualAddDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hostname, setHostname] = useState("");
  const [ipAddress, setIpAddress] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hostname.trim()) {
      toast.error("Hostname is required");
      return;
    }

    setIsLoading(true);

    try {
      const request: ManualAddRequest = {
        hostname: hostname.trim(),
        ipAddress: ipAddress.trim() || undefined,
      };

      const response = await fetch("/api/management/devices/manual", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to add device");
      }

      const device: Device = await response.json();
      toast.success(`Device "${device.hostname}" added successfully`);

      // Convert to DeviceListItem for optimistic update
      const deviceListItem: DeviceListItem = {
        id: device.id,
        hostname: device.hostname,
        ipAddress: device.ipAddress,
        macAddress: device.macAddress,
        lifecycleState: device.lifecycleState,
        discoverySource: device.discoverySource,
        adComputerDn: device.adComputerDn,
        lastSeenAt: device.lastSeenAt,
        hasActiveSession: device.hasActiveSession ?? false,
        isOnline: false, // Newly added devices start as offline
      };

      // Reset form and close dialog
      setHostname("");
      setIpAddress("");
      setOpen(false);
      onSuccess([deviceListItem]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add device");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Plus className="h-4 w-4 mr-2" />
          Add Device
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>Add Device Manually</SheetTitle>
            <SheetDescription>
              Add a device to the discovery list. The device will be created in
              &quot;discovered&quot; state and will not be deployed automatically.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 py-6 flex-1">
            <div className="grid gap-2">
              <Label htmlFor="hostname">Hostname *</Label>
              <Input
                id="hostname"
                placeholder="e.g., PC-FINANCE-01"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ipAddress">IP Address (optional)</Label>
              <Input
                id="ipAddress"
                placeholder="e.g., 10.0.0.15"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
          <SheetFooter className="gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !hostname.trim()}>
              {isLoading ? "Adding..." : "Add Device"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
