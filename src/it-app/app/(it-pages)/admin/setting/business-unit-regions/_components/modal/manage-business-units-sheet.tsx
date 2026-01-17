"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getBusinessUnits, updateBusinessUnit } from "@/lib/api/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";

interface BusinessUnitItem {
  id: number;
  name: string;
  description?: string | null;
  network?: string | null;
  businessUnitRegionId?: number | null;
  isActive: boolean;
}

interface ManageBusinessUnitsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  region: BusinessUnitRegionResponse | null;
  onSuccess?: () => void;
}

export function ManageBusinessUnitsSheet({
  open,
  onOpenChange,
  region,
  onSuccess,
}: ManageBusinessUnitsSheetProps) {
  const [selectedBusinessUnitIds, setSelectedBusinessUnitIds] = useState<number[]>([]);
  const [originalBusinessUnitIds, setOriginalBusinessUnitIds] = useState<number[]>([]);
  const [allBusinessUnits, setAllBusinessUnits] = useState<BusinessUnitItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load business units when sheet opens
  useEffect(() => {
    if (open && region) {
      const fetchData = async () => {
        setIsLoading(true);
        try {
          // Fetch all business units (max 100 per backend limit)
          const response = await getBusinessUnits({
            limit: 100,
            skip: 0,
            filterCriteria: {},
          });

          const businessUnits = response.businessUnits || [];
          setAllBusinessUnits(businessUnits);

          // Find business units that belong to this region
          const assignedIds = businessUnits
            .filter((bu: BusinessUnitItem) => bu.businessUnitRegionId === region.id)
            .map((bu: BusinessUnitItem) => bu.id);

          setSelectedBusinessUnitIds(assignedIds);
          setOriginalBusinessUnitIds(assignedIds);
        } catch (error) {
          console.error("Error fetching business units:", error);
          toast.error("Failed to load business units");
        } finally {
          setIsLoading(false);
        }
      };

      fetchData();
    }
  }, [open, region]);

  const handleToggleBusinessUnit = (businessUnitId: number) => {
    // Prevent removing already-assigned business units
    if (originalBusinessUnitIds.includes(businessUnitId)) {
      toast.error("Cannot remove business units. Reassign them from the Business Units page.");
      return;
    }

    setSelectedBusinessUnitIds((prev) =>
      prev.includes(businessUnitId)
        ? prev.filter((id) => id !== businessUnitId)
        : [...prev, businessUnitId]
    );
  };

  const handleSave = async () => {
    if (!region) return;

    setIsSaving(true);
    try {
      // Only add new business units (removal not supported)
      const toAdd = selectedBusinessUnitIds.filter(
        (id) => !originalBusinessUnitIds.includes(id)
      );

      if (toAdd.length === 0) {
        toast.error("No changes to save");
        setIsSaving(false);
        return;
      }

      // Update business units that should be assigned to this region
      const addPromises = toAdd.map((id) =>
        updateBusinessUnit(id, { businessUnitRegionId: region.id })
      );

      await Promise.all(addPromises);

      toast.success(`${toAdd.length} business unit(s) assigned to ${region.name}`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating business units:", error);
      toast.error(error.message || "Failed to update business units");
    } finally {
      setIsSaving(false);
    }
  };

  // Only count additions as changes (removals not supported)
  const hasChanges = selectedBusinessUnitIds.some(
    (id) => !originalBusinessUnitIds.includes(id)
  );

  // Filter business units based on search query
  const filteredBusinessUnits = allBusinessUnits.filter((bu) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      bu.name?.toLowerCase().includes(searchLower) ||
      bu.description?.toLowerCase().includes(searchLower) ||
      bu.network?.toLowerCase().includes(searchLower)
    );
  });

  const activeBusinessUnits = filteredBusinessUnits.filter((bu) => bu.isActive);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Assign Business Units</SheetTitle>
          <SheetDescription>
            Select additional business units to assign to <strong>{region?.name}</strong>.
            <br />
            <span className="text-xs text-muted-foreground">
              Note: To reassign existing units to another region, use the Business Units page.
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search business units..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              disabled={isLoading}
            />
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-280px)] pr-4">
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : activeBusinessUnits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? "No business units found" : "No active business units available"}
              </div>
            ) : (
              activeBusinessUnits.map((bu) => {
                const isCurrentRegion = bu.businessUnitRegionId === region?.id;
                const isSelected = selectedBusinessUnitIds.includes(bu.id);
                const isOriginallyAssigned = originalBusinessUnitIds.includes(bu.id);

                return (
                  <div
                    key={bu.id}
                    className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                  >
                    <Checkbox
                      id={`bu-${bu.id}`}
                      checked={isSelected}
                      onCheckedChange={() => handleToggleBusinessUnit(bu.id)}
                      disabled={isSaving || isOriginallyAssigned}
                    />
                    <label
                      htmlFor={`bu-${bu.id}`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{bu.name}</span>
                        {isCurrentRegion && !isSelected && (
                          <Badge variant="secondary" className="text-xs">
                            Currently Assigned
                          </Badge>
                        )}
                      </div>
                      {bu.description && (
                        <div className="text-sm text-muted-foreground">
                          {bu.description}
                        </div>
                      )}
                      {bu.network && (
                        <div className="text-xs text-muted-foreground">
                          Network: {bu.network}
                        </div>
                      )}
                    </label>
                    {isSelected && (
                      <Badge variant="default" className="text-xs">
                        Assigned
                      </Badge>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="mt-4">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {selectedBusinessUnitIds.length} business unit
              {selectedBusinessUnitIds.length !== 1 ? "s" : ""} selected
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default ManageBusinessUnitsSheet;
