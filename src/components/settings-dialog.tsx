"use client";

import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface SettingsDialogProps {
  isConfigured: boolean;
}

export function SettingsDialog({ isConfigured }: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          <div>
            <Label className="text-sm">API Provider</Label>
            <p className="text-xs text-muted-foreground mt-1.5">
              {isConfigured ? (
                <>
                  Using <span className="text-green-400">Replicate</span>
                </>
              ) : (
                <>
                  <span className="text-destructive">Not configured.</span> Set{" "}
                  <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                    REPLICATE_API_TOKEN
                  </code>{" "}
                  env var in the Convex dashboard.
                </>
              )}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
