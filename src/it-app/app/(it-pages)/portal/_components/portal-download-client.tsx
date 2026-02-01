"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, AlertCircle, Calendar } from "lucide-react";
import type { ClientVersion } from "@/types/client-versions";

interface PortalDownloadClientProps {
  latestVersion: ClientVersion | null;
  userName: string;
}

export default function PortalDownloadClient({
  latestVersion,
  userName,
}: PortalDownloadClientProps) {
  const handleDownload = () => {
    if (latestVersion?.installerUrl) {
      window.open(latestVersion.installerUrl, "_blank");
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome, {userName}
        </h1>
        <p className="text-muted-foreground text-lg">
          Download the IT Support Center desktop client to get started
        </p>
      </div>

      {/* Download Card or Empty State */}
      {latestVersion && latestVersion.installerUrl ? (
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">Desktop Client Installer</CardTitle>
              <Badge variant="default" className="text-sm">
                v{latestVersion.versionString}
              </Badge>
            </div>
            <CardDescription>
              Download and install the desktop client to submit support requests
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Release Notes */}
            {latestVersion.releaseNotes && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground">
                  What&apos;s New
                </h3>
                <p className="text-sm whitespace-pre-wrap">
                  {latestVersion.releaseNotes}
                </p>
              </div>
            )}

            {/* Release Date */}
            {latestVersion.releasedAt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  Released on {new Date(latestVersion.releasedAt).toLocaleDateString()}
                </span>
              </div>
            )}

            {/* Download Button */}
            <Button
              onClick={handleDownload}
              size="lg"
              className="w-full"
            >
              <Download className="mr-2 h-5 w-5" />
              Download Installer
            </Button>

            {/* File Info */}
          </CardContent>
        </Card>
      ) : (
        <Alert variant="default">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No Installer Available</AlertTitle>
          <AlertDescription>
            The desktop client installer is not currently available. Please contact your IT
            administrator for assistance.
          </AlertDescription>
        </Alert>
      )}

      {/* Help Text */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">Need Help?</h3>
          <p className="text-sm text-muted-foreground">
            If you encounter any issues during installation or have questions, please
            contact your IT support team for assistance.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
