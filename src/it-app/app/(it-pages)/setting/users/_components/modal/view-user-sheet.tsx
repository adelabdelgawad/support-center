"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Eye,
  X,
  User,
  Mail,
  Briefcase,
  Shield,
  Hash,
  CheckCircle,
  XCircle,
  Users
} from "lucide-react";
import type { UserWithRolesResponse } from '@/types/users';

interface ViewUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithRolesResponse;
}

export function ViewUserSheet({
  open,
  onOpenChange,
  user,
}: ViewUserSheetProps) {
  const handleClose = () => {
    onOpenChange(false);
  };

  // Get role details from user.roles
  const roleDetails = user.roles || [];

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-3xl flex flex-col">
        <SheetHeader className="space-y-2 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Eye className="h-4 w-4 text-primary" />
            </div>
            View User
          </SheetTitle>
          <SheetDescription className="text-sm">
            Viewing details for {user.username}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable content area */}
        <ScrollArea className="flex-1 py-4">
          <div className="space-y-4 pr-4">
            {/* User Overview Card */}
            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4 text-primary" />
                  User Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Primary Info - Compact */}
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">{user.fullName || user.username}</h3>
                      <Badge variant={user.isActive ? "default" : "destructive"} className="flex items-center gap-1 text-xs">
                        {user.isActive ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      @{user.username}
                      {user.title && ` • ${user.title}`}
                    </p>
                  </div>
                </div>

                {/* Detailed Information Grid - Compact */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                      <Hash className="h-3 w-3" />
                      User ID
                    </Label>
                    <div className="font-mono text-xs bg-muted px-2 py-1.5 rounded border">
                      #{user.id}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                      <User className="h-3 w-3" />
                      Username
                    </Label>
                    <div className="font-medium text-sm bg-muted px-2 py-1.5 rounded border">
                      {user.username}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                      <User className="h-3 w-3" />
                      Full Name
                    </Label>
                    <div className="text-sm bg-muted px-2 py-1.5 rounded border">
                      {user.fullName || "Not provided"}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                      <Briefcase className="h-3 w-3" />
                      Title
                    </Label>
                    <div className="text-sm bg-muted px-2 py-1.5 rounded border">
                      {user.title || "Not provided"}
                    </div>
                  </div>

                  <div className="space-y-1 md:col-span-2 lg:col-span-2">
                    <Label className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                      <Mail className="h-3 w-3" />
                      Email
                    </Label>
                    <div className="font-mono text-sm bg-muted px-2 py-1.5 rounded border break-all">
                      {user.email || "Not provided"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Separator className="my-2" />

            {/* Roles Card - Compact with side-by-side layout */}
            <Card className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4 text-primary" />
                    Assigned Roles
                  </CardTitle>
                  <Badge variant="secondary" className="font-normal text-xs">
                    {roleDetails.length} {roleDetails.length === 1 ? "role" : "roles"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {roleDetails.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {roleDetails.map((role) => (
                      <div
                        key={role.id}
                        className="flex items-start gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          <Shield className="w-3 h-3 text-primary" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm">{role.name}</h4>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Hash className="w-2.5 h-2.5" />
                            Role ID: {role.id}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-2">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto">
                      <Users className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-medium text-sm text-muted-foreground">No Roles Assigned</h4>
                      <p className="text-xs text-muted-foreground">This user has no roles assigned yet.</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        {/* Always visible close button */}
        <SheetFooter className="pt-4 border-t shrink-0 bg-background">
          <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">
            <X className="mr-2 h-4 w-4" />
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
