/**
 * Claude/Anthropic API Integration Component
 *
 * Allows users to add their Anthropic API key for AI content generation fallback
 */

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ExternalLink, CheckCircle, AlertCircle, X, Eye, EyeOff, Sparkles } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ClaudeStatus {
  connected: boolean;
  hasApiKey: boolean;
  lastTestedAt?: string;
  model?: string;
}

export function ClaudeIntegration() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  // API Key input state
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch current status
  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/integrations/claude/status', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        setStatus({ connected: false, hasApiKey: false });
      }
    } catch (error) {
      console.error('Error fetching Claude status:', error);
      setStatus({ connected: false, hasApiKey: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Open Anthropic Console to get API key
  const handleGetApiKey = () => {
    window.open('https://console.anthropic.com/settings/keys', '_blank');
  };

  // Save API key
  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "API Key Required",
        description: "Please enter your Anthropic API key",
        variant: "destructive"
      });
      return;
    }

    // Basic validation - Anthropic keys start with "sk-ant-"
    if (!apiKey.startsWith('sk-ant-')) {
      toast({
        title: "Invalid API Key Format",
        description: "Anthropic API keys typically start with 'sk-ant-'",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/integrations/claude/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey })
      });

      if (response.ok) {
        toast({
          title: "API Key Saved",
          description: "Claude API key has been saved. Testing connection...",
        });
        setApiKey('');
        setIsEditing(false);
        // Automatically test the connection
        await handleTestConnection();
        await fetchStatus();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save API key');
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : 'Failed to save API key',
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Test connection
  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const response = await fetch('/api/integrations/claude/test', {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: "Connection Successful",
          description: `Claude API is working. Model: ${data.model || 'claude-3-haiku'}`,
        });
        await fetchStatus();
      } else {
        throw new Error(data.message || 'Connection test failed');
      }
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : 'Failed to connect to Claude API',
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  // Disconnect (remove API key)
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const response = await fetch('/api/integrations/claude/disconnect', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        toast({
          title: "Disconnected",
          description: "Claude API key has been removed",
        });
        setStatus({ connected: false, hasApiKey: false });
        setShowDisconnectDialog(false);
      } else {
        throw new Error('Failed to disconnect');
      }
    } catch (error) {
      toast({
        title: "Disconnect Failed",
        description: error instanceof Error ? error.message : 'Failed to disconnect',
        variant: "destructive"
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Claude AI Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Claude AI Integration
              </CardTitle>
              <CardDescription className="mt-1">
                Add Anthropic API key for AI content generation (fallback when Gemini is unavailable)
              </CardDescription>
            </div>
            {status?.connected && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Not Connected State */}
          {!status?.connected && !isEditing && (
            <div className="space-y-4">
              <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">
                  Why add Claude API?
                </h4>
                <ul className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
                  <li>• <strong>Fallback AI</strong> - When Gemini is overloaded, Claude takes over</li>
                  <li>• <strong>Better reliability</strong> - Two AI providers = less downtime</li>
                  <li>• <strong>Quality content</strong> - Claude excels at creative writing</li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleGetApiKey} variant="outline" className="flex-1">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Get API Key from Anthropic
                </Button>
                <Button onClick={() => setIsEditing(true)} className="flex-1 bg-purple-600 hover:bg-purple-700">
                  Enter API Key
                </Button>
              </div>
            </div>
          )}

          {/* API Key Input */}
          {isEditing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="claude-api-key">Anthropic API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="claude-api-key"
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="sk-ant-api03-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      disabled={saving}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your API key is stored securely and only used for AI content generation
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setApiKey('');
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleGetApiKey} variant="outline">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Get Key
                </Button>
                <Button
                  onClick={handleSaveApiKey}
                  disabled={saving || !apiKey.trim()}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save & Test'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Connected State */}
          {status?.connected && !isEditing && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-900 dark:text-green-100">
                    Claude API Connected
                  </span>
                </div>
                <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                  <p>• Model: {status.model || 'claude-3-haiku-20240307'}</p>
                  {status.lastTestedAt && (
                    <p>• Last tested: {new Date(status.lastTestedAt).toLocaleString()}</p>
                  )}
                  <p>• Status: Ready as Gemini fallback</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="flex-1"
                >
                  {testing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="flex-1"
                >
                  Update API Key
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDisconnectDialog(true)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Claude API?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your Anthropic API key. AI content generation will only use Gemini,
              which may fail if Google's servers are overloaded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="bg-red-600 hover:bg-red-700"
            >
              {disconnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
