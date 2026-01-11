"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/custom-toast";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { updateRequestSubcategory } from "@/lib/hooks/use-categories-tags";
import { Link as LinkIcon, Loader2, User } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactSelect, {
  components,
  type ClassNamesConfig,
  type MultiValue,
  type MultiValueProps,
  type OptionProps,
} from "react-select";
import { useRequestDetail } from "../_context/request-detail-context";
import { StatusUpdateSection } from "./status-update-section";

// Types for react-select options
interface TechnicianOption {
  value: string;  // UUID string from backend
  label: string;
  title?: string;
}

// Custom option component with user icon
const CustomOption = (props: OptionProps<TechnicianOption>) => {
  return (
    <components.Option {...props}>
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-muted-foreground" />
        <span>{props.data.label}</span>
        {props.data.title && (
          <span className="text-xs text-muted-foreground">
            - {props.data.title}
          </span>
        )}
      </div>
    </components.Option>
  );
};

// Custom multi value display
const CustomMultiValue = (props: MultiValueProps<TechnicianOption>) => {
  return (
    <components.MultiValue {...props}>
      <div className="flex items-center gap-1">
        <User className="h-3 w-3" />
        <span>{props.data.label}</span>
      </div>
    </components.MultiValue>
  );
};

export function TicketMetadataSidebar() {
  // Get all data from context (no props drilling!)
  const {
    ticket,
    technicians,
    priorities,
    statuses,
    categories,  // SSR categories - no loading state
    addNote,
    assignees,
    assigneesLoading,
    addAssignee,
    removeAssignee,
    takeRequest,
    canEditAssignees, // @deprecated - use canAddAssignees/canRemoveAssignees
    canAddAssignees,
    canRemoveAssignees,
    canTakeRequest,
    canEditRequestDetails,  // For category, subcategory, notes (assignees, Senior, Supervisor, Admin)
    updateTicketPriority,
    updatingTicket,
    currentUser,
    currentUserId,
  } = useRequestDetail();

  // Hydration fix: Defer client-session-dependent rendering until after mount
  // canTakeRequest, canAddAssignees, etc. depend on client-side session
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Check if current status is "count_as_solved" (should disable all editing)
  // IMPORTANT: Use ticket.status directly instead of looking up from statuses array
  // This prevents race condition where statuses array is empty on first render
  // causing inputs to flash as enabled before becoming disabled
  const isStatusSolved = ticket.status?.countAsSolved === true;

  // State for note creation
  const [noteText, setNoteText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isTaking, setIsTaking] = useState(false);

  const [selectedPriority, setSelectedPriority] = useState<string>(() =>
    ticket.priorityId.toString()
  );

  // State for priority change confirmation
  const [pendingPriorityId, setPendingPriorityId] = useState<string | null>(
    null
  );
  const [isUpdatingPriority, setIsUpdatingPriority] = useState(false);

  // State for take confirmation dialog
  const [showTakeConfirm, setShowTakeConfirm] = useState(false);

  // State for assign/unassign confirmation
  const [pendingAssign, setPendingAssign] = useState<TechnicianOption | null>(
    null
  );
  const [pendingUnassign, setPendingUnassign] =
    useState<TechnicianOption | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assigneeOperationLoading, setAssigneeOperationLoading] =
    useState(false);

  // State for last assignee removal warning
  const [showRemoveLastWarning, setShowRemoveLastWarning] = useState(false);
  const [pendingLastRemoval, setPendingLastRemoval] =
    useState<TechnicianOption | null>(null);

  // State for category/subcategory selection
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    () => ticket.subcategory?.category?.id ?? null
  );
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<
    number | null
  >(() => ticket.subcategoryId ?? ticket.subcategory?.id ?? null);
  const [isUpdatingSubcategory, setIsUpdatingSubcategory] = useState(false);
  const [pendingSubcategoryChange, setPendingSubcategoryChange] = useState<{
    subcategoryId: number;
    subcategoryName: string;
  } | null>(null);

  // Derived data
  const requesterName = ticket.requester.fullName || ticket.requester.username;

  // Convert SWR assignees to react-select format
  const selectedAssignees: TechnicianOption[] = useMemo(() => {
    return assignees.map((assignee) => ({
      value: String(assignee.userId),  // UUID string
      label: assignee.fullName || assignee.username,
      title: assignee.title ?? undefined,
    }));
  }, [assignees]);

  // Memoize technician options for react-select
  const technicianOptions: TechnicianOption[] = useMemo(() => {
    return technicians.map((tech) => ({
      value: String(tech.id),  // UUID string
      label: tech.fullName || tech.username,
      title: tech.title ?? undefined,
    }));
  }, [technicians]);

  // Collect all assigned user IDs to filter dropdown options
  const allAssignedUserIds = useMemo(() => {
    const ids = new Set<string>();
    assignees.forEach((a) => {
      ids.add(String(a.userId));  // UUID string
    });
    return ids;
  }, [assignees]);

  // Available technicians for selection (excludes already assigned users)
  const availableTechnicianOptions: TechnicianOption[] = useMemo(() => {
    return technicianOptions.filter(
      (opt) => !allAssignedUserIds.has(opt.value)
    );
  }, [technicianOptions, allAssignedUserIds]);

  // Handle assignee change - detect add/remove and show confirmation
  const handleAssigneeChange = useCallback(
    (options: MultiValue<TechnicianOption>) => {
      const newOptions = options as TechnicianOption[];
      const currentIds = new Set(selectedAssignees.map((a) => a.value));
      const newIds = new Set(newOptions.map((a) => a.value));

      // Find added technician
      const addedOption = newOptions.find((opt) => !currentIds.has(opt.value));
      if (addedOption) {
        // Check permission before allowing add
        // NF-3: canAddAssignees is false when request is solved or user is not a technician
        if (!canAddAssignees) {
          toast.error(
            isStatusSolved
              ? "Cannot modify assignees on a solved request"
              : "You don't have permission to add assignees"
          );
          return;
        }
        setPendingAssign(addedOption);
        return;
      }

      // Find removed technician
      const removedOption = selectedAssignees.find(
        (opt) => !newIds.has(opt.value)
      );
      if (removedOption) {
        // Check permission before allowing remove
        // NF-3: canRemoveAssignees is false when request is solved or user is not a technician
        if (!canRemoveAssignees) {
          toast.error(
            isStatusSolved
              ? "Cannot modify assignees on a solved request"
              : "You don't have permission to remove assignees"
          );
          return;
        }

        // If this is the last assignee, show warning
        if (selectedAssignees.length === 1) {
          setPendingLastRemoval(removedOption);
          setShowRemoveLastWarning(true);
          return;
        }

        setPendingUnassign(removedOption);
        return;
      }
    },
    [selectedAssignees, canAddAssignees, canRemoveAssignees, isStatusSolved]
  );

  // Confirm assign technician - uses SWR mutation
  const handleConfirmAssign = useCallback(async () => {
    if (!pendingAssign || isAssigning) return;

    setIsAssigning(true);
    setAssigneeOperationLoading(true);
    try {
      await addAssignee(
        String(pendingAssign.value),
        pendingAssign.label,
        pendingAssign.title
      );
      toast.success(`${pendingAssign.label} assigned successfully`);
    } catch (error) {
      console.error("❌ Failed to assign technician:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to assign technician"
      );
    } finally {
      setIsAssigning(false);
      setAssigneeOperationLoading(false);
      setPendingAssign(null);
    }
  }, [pendingAssign, isAssigning, addAssignee]);

  // Confirm unassign technician - uses SWR mutation
  const handleConfirmUnassign = useCallback(async () => {
    if (!pendingUnassign || isAssigning) return;

    setIsAssigning(true);
    setAssigneeOperationLoading(true);
    try {
      await removeAssignee(String(pendingUnassign.value));
      toast.success(`${pendingUnassign.label} removed from assignees`);
    } catch (error) {
      console.error("❌ Failed to unassign technician:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to remove technician"
      );
    } finally {
      setIsAssigning(false);
      setAssigneeOperationLoading(false);
      setPendingUnassign(null);
    }
  }, [pendingUnassign, isAssigning, removeAssignee]);

  // Handle take it click - show confirmation
  const handleTakeItClick = useCallback(() => {
    setShowTakeConfirm(true);
  }, []);

  // Confirm take request - uses SWR mutation
  const handleConfirmTake = useCallback(async () => {
    if (isTaking || updatingTicket) return;

    setIsTaking(true);
    try {
      await takeRequest();
      toast.success("Request assigned to you");
    } catch (error) {
      console.error("❌ Failed to take request:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to take request"
      );
    } finally {
      setIsTaking(false);
      setShowTakeConfirm(false);
    }
  }, [isTaking, updatingTicket, takeRequest]);

  // Check if current user is already assigned (use server-provided currentUserId to avoid hydration mismatch)
  const isCurrentUserAssigned = useMemo(() => {
    if (!currentUserId) return false;
    return assignees.some((a) => a.userId === currentUserId);
  }, [assignees, currentUserId]);

  // Handle priority selection - opens confirmation dialog
  const handlePrioritySelect = useCallback(
    (newPriorityId: string) => {
      // Don't show dialog if same priority selected
      if (newPriorityId === selectedPriority) return;
      setPendingPriorityId(newPriorityId);
    },
    [selectedPriority]
  );

  // Get priority name by id for confirmation dialog
  const getPriorityName = useCallback(
    (priorityId: string) => {
      if (!Array.isArray(priorities)) return "Unknown";
      const priority = priorities.find((p) => p.id.toString() === priorityId);
      return priority?.name || "Unknown";
    },
    [priorities]
  );

  // Confirm and update priority
  const handleConfirmPriorityChange = useCallback(async () => {
    if (!pendingPriorityId || isUpdatingPriority || updatingTicket) return;

    const newPriorityName = getPriorityName(pendingPriorityId);
    setIsUpdatingPriority(true);
    try {
      await updateTicketPriority(parseInt(pendingPriorityId, 10));
      setSelectedPriority(pendingPriorityId);
      toast.success(`Priority changed to ${newPriorityName}`);
    } catch (error) {
      console.error("❌ Failed to update priority:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update priority"
      );
    } finally {
      setIsUpdatingPriority(false);
      setPendingPriorityId(null);
    }
  }, [
    pendingPriorityId,
    isUpdatingPriority,
    updatingTicket,
    updateTicketPriority,
    getPriorityName,
  ]);

  // Cancel priority change
  const handleCancelPriorityChange = useCallback(() => {
    setPendingPriorityId(null);
  }, []);

  // Handle category selection - updates available subcategories
  const handleCategorySelect = useCallback(
    (categoryId: string) => {
      const newCategoryId = categoryId ? parseInt(categoryId, 10) : null;
      setSelectedCategoryId(newCategoryId);
      // Clear subcategory selection when category changes since subcategories are category-specific
      if (newCategoryId !== selectedCategoryId) {
        setSelectedSubcategoryId(null);
      }
    },
    [selectedCategoryId]
  );

  // Handle subcategory selection - show confirmation
  const handleSubcategorySelect = useCallback(
    (subcategoryId: string) => {
      if (!subcategoryId || subcategoryId === selectedSubcategoryId?.toString())
        return;

      // Find subcategory from the selected category's subcategories (with defensive array check)
      const category = Array.isArray(categories)
        ? categories.find((c) => c.id === selectedCategoryId)
        : undefined;
      const subcategory = category?.subcategories?.find(
        (s) => s.id.toString() === subcategoryId
      );

      if (subcategory) {
        setPendingSubcategoryChange({
          subcategoryId: subcategory.id,
          subcategoryName: subcategory.nameEn || subcategory.name,
        });
      }
    },
    [categories, selectedCategoryId, selectedSubcategoryId]
  );

  // Confirm subcategory change
  const handleConfirmSubcategoryChange = useCallback(async () => {
    if (!pendingSubcategoryChange || isUpdatingSubcategory) return;

    setIsUpdatingSubcategory(true);
    try {
      await updateRequestSubcategory(
        ticket.id,
        pendingSubcategoryChange.subcategoryId
      );
      setSelectedSubcategoryId(pendingSubcategoryChange.subcategoryId);
      toast.success(
        `Subcategory changed to "${pendingSubcategoryChange.subcategoryName}"`
      );
    } catch (error) {
      console.error("❌ Failed to update subcategory:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update subcategory"
      );
    } finally {
      setIsUpdatingSubcategory(false);
      setPendingSubcategoryChange(null);
    }
  }, [pendingSubcategoryChange, isUpdatingSubcategory, ticket.id]);

  // Get available subcategories for the selected category
  const availableSubcategories = useMemo(() => {
    if (!Array.isArray(categories)) return [];
    const category = categories.find((c) => c.id === selectedCategoryId);
    return category?.subcategories || [];
  }, [categories, selectedCategoryId]);

  // Theme-aware classNames for react-select using Tailwind
  const selectClassNames: ClassNamesConfig<TechnicianOption, true> = useMemo(
    () => ({
      control: ({ isFocused, isDisabled }) =>
        `!min-h-[38px] !rounded-md !border !shadow-sm !px-2 ${
          isDisabled
            ? "!bg-muted !text-muted-foreground !border-input !cursor-not-allowed !opacity-50"
            : isFocused
            ? "!bg-background !border-primary !ring-1 !ring-primary"
            : "!bg-background !border-input hover:!border-muted-foreground/50"
        }`,
      menu: () =>
        "!bg-popover !border !border-border !rounded-md !shadow-md !z-50",
      menuList: () => "!p-1",
      option: ({ isSelected, isFocused }) =>
        `!rounded-sm !px-3 !py-2 !cursor-pointer ${
          isSelected
            ? "!bg-primary/10 !text-foreground"
            : isFocused
            ? "!bg-accent !text-accent-foreground"
            : "!bg-transparent !text-foreground"
        }`,
      singleValue: ({ isDisabled }) =>
        isDisabled ? "!text-muted-foreground" : "!text-foreground",
      multiValue: ({ isDisabled }) =>
        isDisabled
          ? "!bg-muted/50 !rounded !border !border-muted !opacity-60"
          : "!bg-primary/10 !rounded !border !border-primary/20",
      multiValueLabel: ({ isDisabled }) =>
        isDisabled
          ? "!text-muted-foreground !px-1.5 !py-0.5 !text-[13px] !font-medium"
          : "!text-primary !px-1.5 !py-0.5 !text-[13px] !font-medium",
      multiValueRemove: ({ isDisabled }) =>
        isDisabled
          ? "!hidden"
          : "!text-primary/70 !rounded-r hover:!bg-primary/20 hover:!text-primary",
      placeholder: ({ isDisabled }) =>
        isDisabled ? "!text-muted-foreground/50" : "!text-muted-foreground",
      input: ({ isDisabled }) =>
        isDisabled
          ? "!text-muted-foreground !cursor-not-allowed"
          : "!text-foreground",
      indicatorSeparator: ({ isDisabled }) =>
        isDisabled ? "!bg-border !my-2 !opacity-50" : "!bg-border !my-2",
      dropdownIndicator: ({ isDisabled }) =>
        isDisabled
          ? "!text-muted-foreground !px-2 !cursor-not-allowed !opacity-50"
          : "!text-muted-foreground !px-2 hover:!text-foreground",
      clearIndicator: () =>
        "!text-muted-foreground !px-1 hover:!text-destructive",
      noOptionsMessage: () => "!text-muted-foreground !py-2",
      loadingMessage: () => "!text-muted-foreground !py-2",
    }),
    []
  );

  // Handle note submission with SWR optimistic updates
  const handleAddNote = async () => {
    if (!noteText.trim()) {
      setNoteError("Note cannot be empty");
      return;
    }

    if (noteText.length > 2000) {
      setNoteError("Note must not exceed 2000 characters");
      return;
    }

    setIsSubmitting(true);
    setNoteError(null);

    try {
      // Use SWR's addNote
      await addNote(noteText.trim());

      // Clear the textarea on success
      setNoteText("");
      toast.success("Note added successfully");
    } catch (error) {
      console.error("❌ Failed to add note:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while adding the note";
      setNoteError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full md:w-80 border-r border-border bg-card relative flex-shrink-0">
      <ScrollArea className="h-full">
        <div className="p-4">
          {/* Status Section - Prominent display with update capability */}
          <StatusUpdateSection />

          {/* Parent Task Badge - Show if this is a sub-task */}
          {ticket.parentRequestId && ticket.parentRequestTitle && (
            <>
              <Separator className="my-4" />
              <div className="mb-4">
                <Label className="text-sm text-muted-foreground font-medium mb-2 block">
                  Parent Task
                </Label>
                <Link
                  href={`/support-center/requests/${ticket.parentRequestId}`}
                  className="flex items-center gap-2 p-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors group"
                >
                  <LinkIcon className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {ticket.parentRequestTitle}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      #{ticket.parentRequestId.slice(0, 8)}
                    </p>
                  </div>
                </Link>
              </div>
            </>
          )}

          <Separator className="my-4" />

          {/* Assignee Section */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <Label className="text-sm text-muted-foreground font-medium">
                Assignees*
                {(assigneesLoading || assigneeOperationLoading) && (
                  <Loader2 className="h-3 w-3 animate-spin inline ml-1" />
                )}
              </Label>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={handleTakeItClick}
                    disabled={!isMounted || !canTakeRequest}
                  >
                    {isTaking ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        taking...
                      </>
                    ) : isCurrentUserAssigned ? (
                      "assigned"
                    ) : (
                      "take it"
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isStatusSolved
                    ? "Cannot modify - ticket is solved"
                    : isCurrentUserAssigned
                    ? "You are already assigned to this ticket"
                    : "Assign this ticket to yourself"}
                </TooltipContent>
              </Tooltip>
            </div>
            <ReactSelect<TechnicianOption, true>
              instanceId="assignee-select"
              options={availableTechnicianOptions}
              value={selectedAssignees}
              onChange={handleAssigneeChange}
              placeholder="Select assignees..."
              isMulti
              isClearable
              isSearchable
              unstyled
              isDisabled={
                !isMounted || // Hydration fix: disable until mounted
                isStatusSolved ||
                assigneesLoading ||
                assigneeOperationLoading ||
                (!canAddAssignees && !canRemoveAssignees) // Can't add or remove
              }
              components={{
                Option: CustomOption,
                MultiValue: CustomMultiValue,
              }}
              classNames={selectClassNames}
              menuShouldBlockScroll={false}
              styles={{
                menuList: (base) => ({
                  ...base,
                  maxHeight: 200,
                  overflowY: 'auto',
                }),
              }}
              noOptionsMessage={({ inputValue }) =>
                inputValue
                  ? `No users found for "${inputValue}"`
                  : "No users available"
              }
            />
          </div>
          <div>
            {/* NF-3: Show appropriate hints based on new permission model */}
            {assignees.length > 0 && isStatusSolved && (
              <div className="text-xs text-muted-foreground mt-1">
                <p>This request is solved. No modifications allowed.</p>
              </div>
            )}
          </div>
          <Separator className="my-4" />

          {/* Priority */}
          <div className="mb-4">
            <Label className="text-sm text-muted-foreground font-medium">
              Priority
            </Label>
            <Select
              key={`priority-${ticket.priorityId}`}
              value={selectedPriority}
              onValueChange={handlePrioritySelect}
              disabled={isUpdatingPriority || updatingTicket || isStatusSolved}
            >
              <SelectTrigger className="w-full mt-1">
                {isUpdatingPriority ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Updating...</span>
                  </div>
                ) : (
                  <SelectValue>{getPriorityName(selectedPriority)}</SelectValue>
                )}
              </SelectTrigger>
              <SelectContent>
                {priorities.length > 0 ? (
                  priorities.map((priority) => (
                    <SelectItem
                      key={priority.id}
                      value={priority.id.toString()}
                    >
                      {priority.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="loading" disabled>
                    Loading priorities...
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <Separator className="my-4" />

          {/* Category and Subcategory Selection */}
          <div className="mb-4 space-y-3">
            {/* Category Selection */}
            <div>
              <Label className="text-sm text-muted-foreground font-medium">
                Category
              </Label>
              <Select
                value={selectedCategoryId?.toString() || ""}
                onValueChange={handleCategorySelect}
                disabled={isUpdatingSubcategory || isStatusSolved || !canEditRequestDetails}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem
                      key={category.id}
                      value={category.id.toString()}
                    >
                      <div className="flex flex-col">
                        <span>{category.nameEn || category.name}</span>
                        {category.nameAr &&
                          category.nameAr !== category.nameEn && (
                            <span className="text-xs text-muted-foreground">
                              {category.nameAr}
                            </span>
                          )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subcategory Selection */}
            <div>
              <Label className="text-sm text-muted-foreground font-medium">
                Subcategory
              </Label>
              <Select
                value={selectedSubcategoryId?.toString() || ""}
                onValueChange={handleSubcategorySelect}
                disabled={
                  !selectedCategoryId ||
                  availableSubcategories.length === 0 ||
                  isUpdatingSubcategory ||
                  isStatusSolved ||
                  !canEditRequestDetails
                }
              >
                <SelectTrigger className="w-full mt-1">
                  {isUpdatingSubcategory ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Updating...</span>
                    </div>
                  ) : (
                    <SelectValue
                      placeholder={
                        selectedCategoryId
                          ? "Select subcategory..."
                          : "Select category first"
                      }
                    />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {availableSubcategories.length > 0 ? (
                    availableSubcategories.map((subcategory) => (
                      <SelectItem
                        key={subcategory.id}
                        value={subcategory.id.toString()}
                      >
                        <div className="flex flex-col">
                          <span>{subcategory.nameEn || subcategory.name}</span>
                          {subcategory.nameAr &&
                            subcategory.nameAr !==
                              (subcategory.nameEn || subcategory.name) && (
                              <span className="text-xs text-muted-foreground">
                                {subcategory.nameAr}
                              </span>
                            )}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-subcategories" disabled>
                      {selectedCategoryId
                        ? "No subcategories available"
                        : "Select category first"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Note Input */}
          <div className="mb-4">
            <Label className="text-sm text-muted-foreground font-medium">
              Add Note
            </Label>
            <Textarea
              className="w-full mt-1"
              rows={3}
              placeholder={
                isStatusSolved
                  ? "Cannot add notes - ticket is solved"
                  : !canEditRequestDetails
                  ? "You don't have permission to add notes"
                  : "Add a note..."
              }
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                setNoteError(null);
              }}
              disabled={isSubmitting || isStatusSolved || !canEditRequestDetails}
              maxLength={2000}
            />
            {noteError && (
              <p className="text-xs text-destructive mt-1">{noteError}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {noteText.length}/2000 characters
            </p>
          </div>

          {/* Add Note Button */}
          <div className="mt-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleAddNote}
              disabled={isSubmitting || !noteText.trim() || isStatusSolved || !canEditRequestDetails}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                "Add Note"
              )}
            </Button>
          </div>
        </div>
      </ScrollArea>

      {/* Priority Change Confirmation Dialog */}
      <AlertDialog
        open={!!pendingPriorityId}
        onOpenChange={(open) => !open && handleCancelPriorityChange()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Priority</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the priority from{" "}
              <span className="font-semibold text-foreground">
                {getPriorityName(selectedPriority)}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-foreground">
                {pendingPriorityId ? getPriorityName(pendingPriorityId) : ""}
              </span>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingPriority}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPriorityChange}
              disabled={isUpdatingPriority}
            >
              {isUpdatingPriority ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Take Request Confirmation Dialog */}
      <AlertDialog open={showTakeConfirm} onOpenChange={setShowTakeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to assign this request to yourself? This
              will set the status to &quot;In Progress&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTaking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmTake} disabled={isTaking}>
              {isTaking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Taking...
                </>
              ) : (
                "Take Request"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Technician Confirmation Dialog */}
      <AlertDialog
        open={!!pendingAssign}
        onOpenChange={(open) => !open && setPendingAssign(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign Technician</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to assign{" "}
              <span className="font-semibold text-foreground">
                {pendingAssign?.label}
              </span>{" "}
              to this request?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAssigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAssign}
              disabled={isAssigning}
            >
              {isAssigning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Assigning...
                </>
              ) : (
                "Assign"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unassign Technician Confirmation Dialog */}
      <AlertDialog
        open={!!pendingUnassign}
        onOpenChange={(open) => !open && setPendingUnassign(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Assignee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {pendingUnassign?.label}
              </span>{" "}
              from this request?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAssigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUnassign}
              disabled={isAssigning}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isAssigning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Removing...
                </>
              ) : (
                "Remove"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Warning: Cannot remove last assignee */}
      <AlertDialog
        open={showRemoveLastWarning}
        onOpenChange={setShowRemoveLastWarning}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot Remove Last Assignee</AlertDialogTitle>
            <AlertDialogDescription>
              Requests must have at least one assigned technician. You cannot
              remove <strong>{pendingLastRemoval?.label}</strong> as they are
              the only assignee.
              {"\n\n"}
              To reassign this request, please add another technician first,
              then remove {pendingLastRemoval?.label}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setShowRemoveLastWarning(false);
                setPendingLastRemoval(null);
              }}
            >
              Understood
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Subcategory Change Confirmation Dialog */}
      <AlertDialog
        open={!!pendingSubcategoryChange}
        onOpenChange={(open) => !open && setPendingSubcategoryChange(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Subcategory</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the subcategory to{" "}
              <span className="font-semibold text-foreground">
                {pendingSubcategoryChange?.subcategoryName}
              </span>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingSubcategory}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSubcategoryChange}
              disabled={isUpdatingSubcategory}
            >
              {isUpdatingSubcategory ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
