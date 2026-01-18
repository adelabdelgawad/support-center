"use client";

import { useState, useCallback } from "react";
import {
  Radar,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  Monitor,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type {
  NetworkScanRequest,
  DiscoveryResponse,
  ScanType,
  DeviceListItem,
} from "@/types/device";

interface NetworkScanDialogProps {
  onSuccess: (devices?: DeviceListItem[]) => void;
  disabled?: boolean;
}

interface ValidationErrors {
  ipAddress?: string;
  startIp?: string;
  endIp?: string;
  cidr?: string;
}

// IPv4 validation helper
const validateIPv4 = (ip: string): boolean => {
  if (!ip.trim()) return false;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
  });
};

// Maximum addresses per scan
const MAX_SCAN_ADDRESSES = 1024;

// CIDR validation helper
const validateCIDR = (cidr: string): { valid: boolean; error?: string; addressCount?: number } => {
  if (!cidr.trim()) return { valid: false, error: "CIDR is required" };

  const parts = cidr.split("/");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid CIDR format (e.g., 10.0.0.0/24)" };
  }

  if (!validateIPv4(parts[0])) {
    return { valid: false, error: "Invalid network address" };
  }

  const prefix = parseInt(parts[1], 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) {
    return { valid: false, error: "Invalid prefix length (0-32)" };
  }

  // Calculate address count (excluding network and broadcast for /31 and larger)
  const addressCount = prefix >= 31 ? Math.pow(2, 32 - prefix) : Math.pow(2, 32 - prefix) - 2;

  if (addressCount > MAX_SCAN_ADDRESSES) {
    return {
      valid: false,
      error: `Network too large (${addressCount} addresses). Maximum is ${MAX_SCAN_ADDRESSES} addresses`,
      addressCount,
    };
  }

  return { valid: true, addressCount };
};

export function NetworkScanDialog({
  onSuccess,
  disabled,
}: NetworkScanDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Scan configuration
  const [scanType, setScanType] = useState<ScanType | "">("");
  const [ipAddress, setIpAddress] = useState("");
  const [startIp, setStartIp] = useState("");
  const [endIp, setEndIp] = useState("");
  const [cidr, setCidr] = useState("");

  // Validation
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {}
  );

  // Results
  const [scanResult, setScanResult] = useState<DiscoveryResponse | null>(null);

  // Reset state when dialog closes
  const resetState = useCallback(() => {
    setStep(1);
    setScanType("");
    setIpAddress("");
    setStartIp("");
    setEndIp("");
    setCidr("");
    setConfirmed(false);
    setValidationErrors({});
    setScanResult(null);
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isScanning) {
      resetState();
    }
    if (!isScanning) {
      setOpen(newOpen);
    }
  };

  // Field validation on blur
  const validateField = (field: string, value: string) => {
    let error = "";

    switch (field) {
      case "ipAddress":
        if (!value.trim()) {
          error = "IP address is required";
        } else if (!validateIPv4(value)) {
          error = "Invalid IP address format (e.g., 192.168.1.1)";
        }
        break;
      case "startIp":
        if (!value.trim()) {
          error = "Start IP is required";
        } else if (!validateIPv4(value)) {
          error = "Invalid IP address format";
        }
        break;
      case "endIp":
        if (!value.trim()) {
          error = "End IP is required";
        } else if (!validateIPv4(value)) {
          error = "Invalid IP address format";
        } else if (startIp && validateIPv4(startIp)) {
          const startParts = startIp.split(".").map(Number);
          const endParts = value.split(".").map(Number);
          const startNum =
            startParts[0] * 16777216 +
            startParts[1] * 65536 +
            startParts[2] * 256 +
            startParts[3];
          const endNum =
            endParts[0] * 16777216 +
            endParts[1] * 65536 +
            endParts[2] * 256 +
            endParts[3];
          if (endNum < startNum) {
            error = "End IP must be greater than start IP";
          } else if (endNum - startNum + 1 > MAX_SCAN_ADDRESSES) {
            error = `Range too large (max ${MAX_SCAN_ADDRESSES} addresses)`;
          }
        }
        break;
      case "cidr":
        const result = validateCIDR(value);
        if (!result.valid) {
          error = result.error || "Invalid CIDR";
        }
        break;
    }

    setValidationErrors((prev) => ({ ...prev, [field]: error }));
    return !error;
  };

  // Check if current step is valid
  const isStepValid = (): boolean => {
    if (step === 1) {
      return !!scanType;
    }
    if (step === 2) {
      if (!confirmed) return false;

      switch (scanType) {
        case "single":
          return validateIPv4(ipAddress) && !validationErrors.ipAddress;
        case "range":
          return (
            validateIPv4(startIp) &&
            validateIPv4(endIp) &&
            !validationErrors.startIp &&
            !validationErrors.endIp
          );
        case "network":
          return validateCIDR(cidr).valid && !validationErrors.cidr;
        default:
          return false;
      }
    }
    return true;
  };

  // Execute scan
  const executeScan = async () => {
    setIsScanning(true);
    setStep(3);

    try {
      const request: NetworkScanRequest = {
        scanType: scanType as ScanType,
        ...(scanType === "single" && { ipAddress }),
        ...(scanType === "range" && { startIp, endIp }),
        ...(scanType === "network" && { cidr }),
      };

      const response = await fetch("/api/management/devices/network-scan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Scan failed");
      }

      const result: DiscoveryResponse = await response.json();
      setScanResult(result);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to scan network"
      );
      setScanResult({
        createdCount: 0,
        updatedCount: 0,
        totalCount: 0,
        devices: [],
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Handle next button
  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      executeScan();
    } else if (step === 3) {
      // Close and refresh with optimistic data
      toast.success(
        `Scan completed: ${scanResult?.createdCount || 0} new, ${scanResult?.updatedCount || 0} updated`
      );
      setOpen(false);
      const devicesToPass = scanResult?.devices;
      resetState();
      onSuccess(devicesToPass);
    }
  };

  // Handle back button
  const handleBack = () => {
    if (step > 1 && !isScanning) {
      setStep(step - 1);
    }
  };

  // Get scan type label
  const getScanTypeLabel = (type: ScanType) => {
    switch (type) {
      case "single":
        return "Single IP Address";
      case "range":
        return "IP Range";
      case "network":
        return "Network (CIDR)";
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Scan Type</Label>
              <Select
                value={scanType}
                onValueChange={(v) => setScanType(v as ScanType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a scan type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Single IP Address</span>
                      <span className="text-xs text-muted-foreground">
                        Scan one specific device
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="range">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">IP Range</span>
                      <span className="text-xs text-muted-foreground">
                        Scan a range of IPs (max {MAX_SCAN_ADDRESSES})
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="network">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Network (CIDR)</span>
                      <span className="text-xs text-muted-foreground">
                        Scan a subnet (max {MAX_SCAN_ADDRESSES} addresses)
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Security Warning</AlertTitle>
              <AlertDescription>
                Network scans may trigger security alerts. Use only on approved
                networks with proper authorization.
              </AlertDescription>
            </Alert>

            {/* Single IP Input */}
            {scanType === "single" && (
              <div className="space-y-2">
                <Label htmlFor="ipAddress">
                  IP Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ipAddress"
                  placeholder="e.g., 192.168.1.100"
                  value={ipAddress}
                  onChange={(e) => {
                    setIpAddress(e.target.value);
                    if (validationErrors.ipAddress) {
                      setValidationErrors((prev) => ({
                        ...prev,
                        ipAddress: "",
                      }));
                    }
                  }}
                  onBlur={(e) => validateField("ipAddress", e.target.value)}
                  className={
                    validationErrors.ipAddress
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                  disabled={isScanning}
                />
                {validationErrors.ipAddress && (
                  <div className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{validationErrors.ipAddress}</span>
                  </div>
                )}
              </div>
            )}

            {/* Range Inputs */}
            {scanType === "range" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startIp">
                    Start IP <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="startIp"
                    placeholder="e.g., 192.168.1.1"
                    value={startIp}
                    onChange={(e) => {
                      setStartIp(e.target.value);
                      if (validationErrors.startIp) {
                        setValidationErrors((prev) => ({
                          ...prev,
                          startIp: "",
                        }));
                      }
                    }}
                    onBlur={(e) => validateField("startIp", e.target.value)}
                    className={
                      validationErrors.startIp
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    }
                    disabled={isScanning}
                  />
                  {validationErrors.startIp && (
                    <div className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span>{validationErrors.startIp}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endIp">
                    End IP <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="endIp"
                    placeholder="e.g., 192.168.1.254"
                    value={endIp}
                    onChange={(e) => {
                      setEndIp(e.target.value);
                      if (validationErrors.endIp) {
                        setValidationErrors((prev) => ({ ...prev, endIp: "" }));
                      }
                    }}
                    onBlur={(e) => validateField("endIp", e.target.value)}
                    className={
                      validationErrors.endIp
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    }
                    disabled={isScanning}
                  />
                  {validationErrors.endIp && (
                    <div className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span>{validationErrors.endIp}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CIDR Input */}
            {scanType === "network" && (
              <div className="space-y-2">
                <Label htmlFor="cidr">
                  CIDR Range <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cidr"
                  placeholder="e.g., 10.0.0.0/24"
                  value={cidr}
                  onChange={(e) => {
                    setCidr(e.target.value);
                    if (validationErrors.cidr) {
                      setValidationErrors((prev) => ({ ...prev, cidr: "" }));
                    }
                  }}
                  onBlur={(e) => validateField("cidr", e.target.value)}
                  className={
                    validationErrors.cidr
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                  disabled={isScanning}
                />
                {validationErrors.cidr && (
                  <div className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{validationErrors.cidr}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Maximum subnet size is /22 ({MAX_SCAN_ADDRESSES} addresses)
                </p>
              </div>
            )}

            {/* Confirmation checkbox */}
            <div className="flex items-start gap-2 pt-2">
              <Checkbox
                id="confirm"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
                disabled={isScanning}
              />
              <Label htmlFor="confirm" className="text-sm font-normal leading-relaxed">
                I confirm I have authorization to scan this network and
                understand this may trigger security alerts
              </Label>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="py-4">
            {isScanning ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium">Scanning network...</p>
                <p className="text-sm text-muted-foreground">
                  {scanType === "single"
                    ? `Checking ${ipAddress}`
                    : scanType === "range"
                      ? `Scanning ${startIp} - ${endIp}`
                      : `Scanning ${cidr}`}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Phase 1: Ping sweep, Phase 2: Port check, Phase 3: DNS resolution
                </p>
              </div>
            ) : scanResult ? (
              <div className="space-y-4">
                {/* Scan Statistics */}
                {scanResult.hostsScanned !== undefined && (
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <div className="text-sm font-medium mb-2">Scan Statistics</div>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <div className="font-semibold">{scanResult.hostsScanned}</div>
                        <div className="text-xs text-muted-foreground">Scanned</div>
                      </div>
                      <div>
                        <div className="font-semibold text-green-600">
                          {scanResult.hostsReachable}
                        </div>
                        <div className="text-xs text-muted-foreground">Reachable</div>
                      </div>
                      <div>
                        <div className="font-semibold text-blue-600">
                          {scanResult.hostsDeployable}
                        </div>
                        <div className="text-xs text-muted-foreground">Deployable</div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Deployable = has SMB port (445) open for remote installation
                    </p>
                  </div>
                )}

                {/* Device Summary */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg border bg-green-50 p-4">
                    <div className="text-2xl font-bold text-green-600">
                      {scanResult.createdCount}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      New Devices
                    </div>
                  </div>
                  <div className="rounded-lg border bg-blue-50 p-4">
                    <div className="text-2xl font-bold text-blue-600">
                      {scanResult.updatedCount}
                    </div>
                    <div className="text-sm text-muted-foreground">Updated</div>
                  </div>
                  <div className="rounded-lg border bg-gray-50 p-4">
                    <div className="text-2xl font-bold text-gray-600">
                      {scanResult.totalCount}
                    </div>
                    <div className="text-sm text-muted-foreground">Total</div>
                  </div>
                </div>

                {/* Device list */}
                {scanResult.devices.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto rounded-lg border">
                    {scanResult.devices.map((device) => (
                      <div
                        key={device.id}
                        className="flex items-center gap-3 border-b p-3 last:border-b-0"
                      >
                        <Monitor className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">{device.hostname}</div>
                          <div className="text-sm text-muted-foreground">
                            {device.ipAddress}
                          </div>
                        </div>
                        <Check className="h-5 w-5 text-green-500" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No responsive devices found in the scanned range.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        );
    }
  };

  // Step indicator
  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 pb-4 border-b">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              s < step
                ? "bg-primary text-primary-foreground"
                : s === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {s < step ? <Check className="h-4 w-4" /> : s}
          </div>
          {s < 3 && (
            <div
              className={`mx-2 h-0.5 w-8 ${s < step ? "bg-primary" : "bg-muted"}`}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Radar className="h-4 w-4 mr-2" />
          Network Scan
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-[640px] flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {step === 1 && "Select Scan Type"}
            {step === 2 && `Configure ${scanType ? getScanTypeLabel(scanType as ScanType) : ""} Scan`}
            {step === 3 && "Scan Results"}
          </SheetTitle>
          <SheetDescription>
            {step === 1 && "Choose how you want to discover devices on the network."}
            {step === 2 && "Enter the scan parameters and confirm authorization."}
            {step === 3 &&
              (isScanning
                ? "Please wait while we scan for devices..."
                : "Review the discovered devices.")}
          </SheetDescription>
        </SheetHeader>

        {renderStepIndicator()}

        <div className="flex-1 overflow-y-auto">
          {renderStepContent()}
        </div>

        <SheetFooter className="flex-row justify-between gap-2 pt-4 border-t">
          <div>
            {step > 1 && step < 3 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={isScanning}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div>
            {step === 3 && !isScanning ? (
              <Button onClick={handleNext}>
                <Check className="h-4 w-4 mr-1" />
                Done
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!isStepValid() || isScanning}
              >
                {isScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : step === 2 ? (
                  <>
                    Start Scan
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
