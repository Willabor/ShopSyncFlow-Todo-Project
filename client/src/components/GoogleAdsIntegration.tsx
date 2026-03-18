/**
 * Google Ads Integration Component
 *
 * Allows users to connect/disconnect Google Ads via OAuth
 */

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, CheckCircle, AlertCircle, X, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

interface GoogleAdsStatus {
  connected: boolean;
  provider?: string;
  isActive?: boolean;
  config?: {
    customerId?: string;
    loginCustomerId?: string;
  };
  lastUsedAt?: string;
  createdAt?: string;
  tokenExpiresAt?: string;
  updatedAt?: string;
}

// Helper to calculate days since a date
function getDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Helper to get token expiration status
function getTokenExpirationStatus(tokenExpiresAt?: string, updatedAt?: string): {
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  color: string;
} {
  // If no expiration date, check when token was last updated
  if (!tokenExpiresAt) {
    if (updatedAt) {
      const daysSinceUpdate = getDaysSince(updatedAt);
      if (daysSinceUpdate >= 7) {
        return {
          status: 'warning',
          message: 'Token status unknown. Consider testing connection.',
          color: 'text-yellow-600 dark:text-yellow-400'
        };
      }
    }
    return {
      status: 'healthy',
      message: 'Connection is active.',
      color: 'text-green-600 dark:text-green-400'
    };
  }

  const expiresAt = new Date(tokenExpiresAt);
  const now = new Date();
  const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilExpiry <= 0) {
    return {
      status: 'critical',
      message: 'Token expired. Click "Test Connection" to refresh.',
      color: 'text-red-600 dark:text-red-400'
    };
  } else if (hoursUntilExpiry <= 1) {
    return {
      status: 'warning',
      message: 'Token expires soon. Click "Test Connection" to refresh.',
      color: 'text-yellow-600 dark:text-yellow-400'
    };
  } else {
    return {
      status: 'healthy',
      message: 'Token is valid.',
      color: 'text-green-600 dark:text-green-400'
    };
  }
}

export function GoogleAdsIntegration() {
  const { toast } = useToast();
  const [status, setStatus] = useState<GoogleAdsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  // Check connection status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  // Check URL params for OAuth callback status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const statusParam = params.get('status');
    const message = params.get('message');

    if (tab === 'integrations') {
      if (statusParam === 'success') {
        toast({
          title: '✅ Google Ads Connected!',
          description: 'Your Google Ads account has been successfully connected.',
        });
        checkStatus(); // Refresh status
        // Clean up URL
        window.history.replaceState({}, '', '/settings?tab=integrations');
      } else if (statusParam === 'error') {
        toast({
          title: '❌ Connection Failed',
          description: message || 'Failed to connect Google Ads account.',
          variant: 'destructive',
        });
        // Clean up URL
        window.history.replaceState({}, '', '/settings?tab=integrations');
      }
    }
  }, [toast]);

  const checkStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/integrations/google-ads/status', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to check status');
      }

      const data = await response.json();
      setStatus(data);
    } catch (error: any) {
      console.error('Error checking Google Ads status:', error);
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);

      // Request authorization URL
      const response = await fetch('/api/integrations/google-ads/initiate', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to initiate OAuth');
      }

      const data = await response.json();

      if (!data.authUrl) {
        throw new Error('No authorization URL received');
      }

      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        data.authUrl,
        'Google Ads Authorization',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes`
      );

      if (!popup) {
        toast({
          title: 'Popup Blocked',
          description: 'Please allow popups for this site and try again.',
          variant: 'destructive',
        });
        return;
      }

      // Monitor popup for close
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setConnecting(false);
          // Don't refresh status here - it will be refreshed via URL params
        }
      }, 500);
    } catch (error: any) {
      console.error('Error connecting Google Ads:', error);
      toast({
        title: 'Connection Failed',
        description: error.message,
        variant: 'destructive',
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const response = await fetch('/api/integrations/google-ads/disconnect', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      toast({
        title: 'Disconnected',
        description: 'Google Ads account has been disconnected.',
      });

      setStatus({ connected: false });
      setDisconnectDialogOpen(false);
    } catch (error: any) {
      console.error('Error disconnecting Google Ads:', error);
      toast({
        title: 'Disconnect Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);

      const response = await fetch('/api/integrations/google-ads/test', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTestResult({ success: true, message: data.message || 'Connection is working!' });
        toast({
          title: 'Connection Verified',
          description: 'Google Ads API is responding correctly.',
        });
      } else {
        setTestResult({ success: false, message: data.message || 'Connection test failed' });
        toast({
          title: 'Connection Failed',
          description: data.message || 'Token may have expired. Please reconnect.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Connection test failed' });
      toast({
        title: '❌ Connection Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <svg className="w-8 h-8" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
              <path fill="#FBBC04" d="M153.6,153.6L134.4,76.8L96,192h57.6V153.6z"/>
              <path fill="#4285F4" d="M96,0L38.4,153.6h57.6L134.4,76.8L96,0z"/>
              <circle fill="#34A853" cx="38.4" cy="153.6" r="38.4"/>
            </svg>
            <div>
              <CardTitle>Google Ads</CardTitle>
              <CardDescription>Connect your Google Ads account for keyword research</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-10 h-10" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" aria-label="Google Ads">
                <path fill="#FBBC04" d="M153.6,153.6L134.4,76.8L96,192h57.6V153.6z"/>
                <path fill="#4285F4" d="M96,0L38.4,153.6h57.6L134.4,76.8L96,0z"/>
                <circle fill="#34A853" cx="38.4" cy="153.6" r="38.4"/>
              </svg>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>Google Ads</CardTitle>
                  {status?.connected ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Not Connected
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {status?.connected
                    ? 'Your Google Ads account is connected and active'
                    : 'Connect your Google Ads account for keyword research'}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.connected ? (
            <>
              {/* Token Status */}
              {(() => {
                const tokenStatus = getTokenExpirationStatus(status.tokenExpiresAt, status.updatedAt);
                const daysSinceCreated = status.createdAt ? getDaysSince(status.createdAt) : 0;
                return (
                  <div className={`flex items-center gap-2 p-3 rounded-md ${
                    tokenStatus.status === 'critical' ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800' :
                    tokenStatus.status === 'warning' ? 'bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800' :
                    'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800'
                  }`}>
                    {tokenStatus.status === 'critical' ? (
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    ) : tokenStatus.status === 'warning' ? (
                      <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    )}
                    <div className="flex-1">
                      <div className={`font-medium ${tokenStatus.color}`}>
                        Connected {daysSinceCreated === 0 ? 'today' : daysSinceCreated === 1 ? '1 day ago' : `${daysSinceCreated} days ago`}
                      </div>
                      <div className="text-sm text-muted-foreground">{tokenStatus.message}</div>
                    </div>
                    {tokenStatus.status !== 'healthy' && (
                      <Button
                        size="sm"
                        variant={tokenStatus.status === 'critical' ? 'destructive' : 'outline'}
                        onClick={handleConnect}
                        disabled={connecting}
                        className="gap-1"
                      >
                        <RefreshCw className={`h-3 w-3 ${connecting ? 'animate-spin' : ''}`} />
                        Reconnect
                      </Button>
                    )}
                  </div>
                );
              })()}

              {/* Test Connection Result */}
              {testResult && (
                <div className={`flex items-center gap-2 p-3 rounded-md ${
                  testResult.success
                    ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800'
                }`}>
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                  <span className={testResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                    {testResult.message}
                  </span>
                </div>
              )}

              {/* Connected State */}
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Account Details:</span>
                </div>
                <div className="bg-muted rounded-md p-3 space-y-1 text-sm">
                  {status.config?.customerId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer ID:</span>
                      <span className="font-mono">{status.config.customerId}</span>
                    </div>
                  )}
                  {status.config?.loginCustomerId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Manager ID:</span>
                      <span className="font-mono">{status.config.loginCustomerId}</span>
                    </div>
                  )}
                  {status.lastUsedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Used:</span>
                      <span>{new Date(status.lastUsedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  {status.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Connected:</span>
                      <span>{new Date(status.createdAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="gap-2"
                      >
                        {testing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Test Connection
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Verify that the Google Ads API token is still valid</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  variant="outline"
                  onClick={() => setDisconnectDialogOpen(true)}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Disconnect
                </Button>
                <Button variant="outline" asChild className="gap-2">
                  <a
                    href="https://ads.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Google Ads
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Disconnected State */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Connect your Google Ads account to enable:
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Keyword search volume data</li>
                  <li>Competition analysis</li>
                  <li>Suggested bid estimates</li>
                  <li>Related keyword suggestions</li>
                </ul>
              </div>

              <Button
                onClick={handleConnect}
                disabled={connecting}
                className="gap-2"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4" />
                    Connect Google Ads
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google Ads?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect your Google Ads account. You'll need to reconnect to use keyword research features.
              Your saved data will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
