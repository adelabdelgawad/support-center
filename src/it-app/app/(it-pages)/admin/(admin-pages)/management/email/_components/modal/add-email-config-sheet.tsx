"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createEmailConfig } from "@/lib/api/email-config";
import { toastError } from "@/lib/toast";
import type { EmailConfig } from "@/types/email-config";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  smtpHost: z.string().min(1, "SMTP host is required"),
  smtpPort: z.number().min(1).max(65535),
  smtpUser: z.string().min(1, "SMTP user is required"),
  smtpFrom: z.string().email("Must be a valid email address"),
  password: z.string().min(1, "Password is required"),
  smtpTls: z.boolean(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddEmailConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (config: EmailConfig) => void;
}

export function AddEmailConfigSheet({
  open,
  onOpenChange,
  onSuccess,
}: AddEmailConfigSheetProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      smtpHost: "",
      smtpPort: 587,
      smtpUser: "",
      smtpFrom: "",
      password: "",
      smtpTls: true,
      isActive: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset();
    }
  }, [open, form]);

  const handleSave = async (data: FormValues) => {
    setIsLoading(true);
    try {
      const result = await createEmailConfig(data);

      if (onSuccess) {
        onSuccess(result);
      }
      onOpenChange(false);
    } catch (error: any) {
      toastError(error.message || "Failed to create email configuration");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Email Configuration</SheetTitle>
          <SheetDescription>
            Configure SMTP settings for sending emails from the application
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSave)}
            className="space-y-4 mt-6"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Primary SMTP" {...field} />
                  </FormControl>
                  <FormDescription>
                    A unique name for this configuration
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="smtpHost"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>SMTP Host</FormLabel>
                    <FormControl>
                      <Input placeholder="smtp.example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smtpPort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value))
                        }
                      />
                    </FormControl>
                    <FormDescription>25, 465 (SSL), or 587 (TLS)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="smtpTls"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>TLS/STARTTLS</FormLabel>
                      <FormDescription>Use TLS encryption</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="smtpUser"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SMTP Username</FormLabel>
                  <FormControl>
                    <Input placeholder="user@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SMTP Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormDescription>
                    Will be encrypted before storage
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="smtpFrom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From Email Address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="noreply@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Default sender address for emails
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Set as Active Configuration
                    </FormLabel>
                    <FormDescription>
                      Make this the default email configuration
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Configuration"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
