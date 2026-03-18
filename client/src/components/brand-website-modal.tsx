/**
 * Brand Website Configuration Modal
 *
 * Allows users to configure or update the website URL for a vendor/brand.
 * Displays when a vendor doesn't have a website URL configured.
 */

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Globe, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BrandWebsiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandName: string;
  onSave: (websiteUrl: string | null, hasWebsite: boolean) => Promise<void>;
}

export function BrandWebsiteModal({
  isOpen,
  onClose,
  brandName,
  onSave
}: BrandWebsiteModalProps) {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hasNoWebsite, setHasNoWebsite] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    // Validate URL if provided
    if (!hasNoWebsite && websiteUrl) {
      try {
        let url = websiteUrl.trim();

        // Add https:// if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        // Validate URL format
        new URL(url);

        setIsSaving(true);
        await onSave(url, true);

        toast({
          title: "Website URL Saved",
          description: `Brand website configured for ${brandName}`,
        });

        onClose();
      } catch (error) {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid website URL (e.g., https://eptm.com)",
          variant: "destructive",
        });
        return;
      } finally {
        setIsSaving(false);
      }
    } else if (hasNoWebsite) {
      // Brand has no website
      setIsSaving(true);
      await onSave(null, false);

      toast({
        title: "Configuration Saved",
        description: `${brandName} marked as having no website`,
      });

      setIsSaving(false);
      onClose();
    } else {
      toast({
        title: "Website URL Required",
        description: "Please enter a website URL or check 'No Website'",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Brand Website Required
          </DialogTitle>
          <DialogDescription>
            Configure the official website for <span className="font-semibold">{brandName}</span> to enable product data enrichment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="website-url">Website URL</Label>
            <Input
              id="website-url"
              placeholder="https://eptm.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              disabled={hasNoWebsite || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Enter the brand's official website URL
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="no-website"
              checked={hasNoWebsite}
              onCheckedChange={(checked) => setHasNoWebsite(checked as boolean)}
              disabled={isSaving}
            />
            <label
              htmlFor="no-website"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              This brand does not have a website
            </label>
          </div>

          {hasNoWebsite && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-500 rounded-md">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Product enrichment will be disabled for this brand. You won't be able to fetch additional product details from their website.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
