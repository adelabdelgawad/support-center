/**
 * Login Route - Manual AD Authentication page
 *
 * This page handles:
 * - Username/password input for Active Directory login
 * - Error display
 * - Redirect to /tickets on success
 * - Link back to SSO login
 */

import { useNavigate } from "@solidjs/router";
import { createSignal, createEffect, Show, onMount } from "solid-js";
import { authStore, useIsAuthenticated, useAuthLoading, useAuthError } from "@/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { AlertCircle, ArrowLeft } from "lucide-solid";
import { getVersion } from "@tauri-apps/api/app";

export default function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const authError = useAuthError();

  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [appVersion, setAppVersion] = createSignal("...");

  // Load app version on mount
  onMount(async () => {
    try {
      const version = await getVersion();
      setAppVersion(version);
    } catch (error) {
      console.error("Failed to get app version:", error);
      setAppVersion("1.0.0"); // Fallback
    }
  });

  // Redirect if already authenticated
  createEffect(() => {
    if (isAuthenticated()) {
      navigate("/tickets", { replace: true });
    }
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    authStore.clearError();

    if (!username().trim() || !password().trim()) {
      return;
    }

    const success = await authStore.loginWithAD(username().trim(), password());

    if (success) {
      navigate("/tickets", { replace: true });
    }
  };

  const handleBackToSSO = () => {
    authStore.clearError();
    navigate("/sso");
  };

  return (
    <div dir="ltr" class="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-background p-4">
      <Card class="w-full max-w-md">
        <CardHeader class="space-y-1 text-center">
          <CardTitle class="text-2xl font-bold">IT Service Center</CardTitle>
          <CardDescription>
            Sign in with your Windows credentials
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} class="space-y-4" dir="ltr">
            {/* Error message */}
            <Show when={authError()}>
              <div class="rounded-md bg-destructive/10 p-3">
                <div class="flex items-start gap-2">
                  <AlertCircle class="mt-0.5 h-4 w-4 text-destructive" />
                  <p class="text-sm text-destructive">{authError()}</p>
                </div>
              </div>
            </Show>

            {/* Username field */}
            <div class="space-y-2">
              <Label for="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username()}
                onInput={(e) => setUsername(e.currentTarget.value)}
                disabled={isLoading()}
                autocomplete="username"
                autofocus
              />
            </div>

            {/* Password field */}
            <div class="space-y-2">
              <Label for="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                disabled={isLoading()}
                autocomplete="current-password"
              />
            </div>

            {/* Submit button */}
            <Button
              type="submit"
              class="w-full"
              size="lg"
              disabled={isLoading() || !username().trim() || !password().trim()}
            >
              <Show when={isLoading()} fallback="Sign In">
                <Spinner size="sm" class="mr-2" />
                Signing in...
              </Show>
            </Button>
          </form>

          {/* Help text */}
          <p class="mt-4 text-center text-sm text-muted-foreground">
            Use your company network credentials to sign in.
          </p>
        </CardContent>

        <CardFooter class="justify-between border-t">
          <button
            onClick={handleBackToSSO}
            class="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft class="h-4 w-4" />
            Back to SSO login
          </button>

          {/* App Version */}
          <span class="text-xs text-muted-foreground font-mono">
            v{appVersion()}
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
