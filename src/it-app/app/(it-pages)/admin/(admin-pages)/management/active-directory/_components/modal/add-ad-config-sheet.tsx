"use client";

import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { createADConfig } from "@/lib/api/active-directory-config";
import { toastError } from "@/lib/toast";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  path: z.string().min(1, "Server path is required"),
  domainName: z.string().min(1, "Domain name is required"),
  port: z.number().min(1).max(65535),
  useSsl: z.boolean(),
  ldapUsername: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof formSchema>;

interface AddADConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (config: any) => void;
}

export function AddADConfigSheet({ open, onOpenChange, onSuccess }: AddADConfigSheetProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      path: "",
      domainName: "",
      port: 389,
      useSsl: true,
      ldapUsername: "",
      password: "",
    },
  });

  // Compute Base DN from domain name
  const domainName = form.watch("domainName");
  const computedBaseDn = useMemo(() => {
    if (!domainName) return "Enter domain name above";

    return domainName
      .split(".")
      .map((part) => `DC=${part}`)
      .join(",");
  }, [domainName]);

  useEffect(() => {
    if (open) {
      form.reset();
    }
  }, [open, form]);

  const handleSave = async (data: FormValues) => {
    setIsLoading(true);
    try {
      const result = await createADConfig(data);

      if (onSuccess) {
        onSuccess(result);
      }
      onOpenChange(false);
    } catch (error: any) {
      toastError(error.message || "Failed to create AD configuration");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Active Directory Configuration</SheetTitle>
          <SheetDescription>
            Configure a new Active Directory server for authentication and user sync
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4 mt-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Primary DC" {...field} />
                  </FormControl>
                  <FormDescription>
                    A unique label for this configuration
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="path"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>LDAP Server</FormLabel>
                  <FormControl>
                    <Input placeholder="dc.example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="domainName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Domain Name</FormLabel>
                  <FormControl>
                    <Input placeholder="DOMAIN" {...field} />
                  </FormControl>
                  <FormDescription>
                    Used for authentication (user@DOMAIN)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="useSsl"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Use SSL</FormLabel>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="ldapUsername"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Account Username</FormLabel>
                  <FormControl>
                    <Input placeholder="ldap_service" {...field} />
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
                  <FormLabel>Service Account Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormDescription>
                    Will be encrypted before storing
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Computed Base DN Display */}
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Computed Base DN</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {computedBaseDn}
                  </p>
                </div>
                <Badge variant="secondary">Auto-computed</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                The Base DN is automatically computed from the domain name
              </p>
            </div>

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
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Configuration
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
