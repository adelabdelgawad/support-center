"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "@/components/ui/custom-toast";
import { ChevronRight, Loader2, UserPlus } from "lucide-react";
import { useRequestDetail } from "../_context/request-detail-context";

/**
 * Inline action card for picking unassigned requests
 *
 * Displays in the chat timeline when:
 * - Request has zero assigned technicians
 * - Current user is a technician
 * - Request is not closed/resolved
 *
 * HYDRATION SAFETY:
 * - Renders BOTH mobile and desktop layouts in the DOM
 * - Uses CSS classes (md:hidden / hidden md:flex) to control visibility
 * - No conditional rendering based on isMobile prop
 * - Prevents hydration mismatches on mobile devices
 *
 * Mobile-first design:
 * - On mobile: entire card is tappable (touch-friendly)
 * - On desktop: button click only
 */
export function PickRequestCard() {
  const { takeRequest, canTakeRequest } = useRequestDetail();

  const [showConfirm, setShowConfirm] = useState(false);
  const [isTaking, setIsTaking] = useState(false);

  // Handle click to open confirmation dialog
  const handlePickClick = useCallback(() => {
    if (isTaking) return;
    setShowConfirm(true);
  }, [isTaking]);

  // Confirm and take the request
  const handleConfirmTake = useCallback(async () => {
    if (isTaking) return;

    setIsTaking(true);
    try {
      await takeRequest();
      toast.success("Request assigned to you");
      setShowConfirm(false);
    } catch (error) {
      console.error("Failed to take request:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to take request"
      );
    } finally {
      setIsTaking(false);
    }
  }, [isTaking, takeRequest]);

  // Don't render if user can't take the request
  if (!canTakeRequest) {
    return null;
  }

  return (
    <>
      {/* Inline action card in chat timeline */}
      <div className="flex justify-center w-full">
        {/* Mobile version - visible on mobile, hidden on md+ */}
        <Card
          onClick={handlePickClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!isTaking) handlePickClick();
            }
          }}
          tabIndex={0}
          role="button"
          aria-label="Pick this request - tap to assign yourself"
          className="md:hidden border-primary/30 bg-primary/5 w-full mx-2 cursor-pointer active:scale-[0.98] active:bg-primary/10 transition-all duration-150 shadow-sm select-none"
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              {/* Icon */}
              <div className="flex-shrink-0 p-2 rounded-full bg-primary/10">
                <UserPlus className="h-5 w-5 text-primary" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">
                  Pick This Request
                </p>
                <p className="text-muted-foreground text-xs">
                  Tap to assign yourself
                </p>
              </div>

              {/* Chevron indicator for tappable action */}
              {isTaking ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Desktop version - hidden on mobile, visible on md+ */}
        <Card className="hidden md:block border-primary/30 bg-primary/5 max-w-md w-full shadow-sm select-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              {/* Icon and text */}
              <div className="flex items-center gap-3 flex-1">
                <div className="flex-shrink-0 p-2 rounded-full bg-primary/10">
                  <UserPlus className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-base">
                    Pick This Request
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Assign yourself to handle this request
                  </p>
                </div>
              </div>

              {/* Action button - desktop only */}
              <Button
                onClick={handlePickClick}
                disabled={isTaking}
                className="flex-shrink-0"
                size="default"
              >
                {isTaking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Taking...
                  </>
                ) : (
                  "Pick this request"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation dialog - same for both mobile and desktop */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="max-w-[90vw] md:max-w-lg rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Pick This Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to assign this request to yourself?
              This will set the status to &quot;In Progress&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogAction
              onClick={handleConfirmTake}
              disabled={isTaking}
              className="w-full sm:w-auto h-11"
            >
              {isTaking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Assigning...
                </>
              ) : (
                "Yes, Pick Request"
              )}
            </AlertDialogAction>
            <AlertDialogCancel
              disabled={isTaking}
              className="w-full sm:w-auto h-11 mt-0"
            >
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
