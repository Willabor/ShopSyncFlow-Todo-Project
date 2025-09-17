import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Shield, AlertCircle, Clock, User, FileText } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import type { AuditLog } from "@shared/schema";

export default function AuditLogPage() {
  const { user } = useAuth();

  const { data: auditLogs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit"],
    enabled: ["SuperAdmin", "Auditor"].includes(user?.role || ""),
  });

  if (!["SuperAdmin", "Auditor"].includes(user?.role || "")) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex">
          <Sidebar />
          <div className="flex-1 p-8">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardHeader className="text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
                  <CardTitle>Access Denied</CardTitle>
                  <CardDescription>
                    You don't have permission to view audit logs. Only SuperAdmins and Auditors can access this page.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-audit-title">
                System Audit Log
              </h1>
              <p className="text-muted-foreground">
                Complete audit trail of all system activities and user actions.
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="animate-pulse space-y-3">
                        <div className="h-4 bg-muted rounded w-3/4"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                        <div className="h-3 bg-muted rounded w-1/3"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <Card>
                <CardHeader className="text-center py-16">
                  <FileText className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                  <CardTitle className="text-muted-foreground">No Audit Logs</CardTitle>
                  <CardDescription>
                    No audit logs have been recorded yet. Activity will appear here as users interact with the system.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="space-y-4" data-testid="container-audit-logs">
                {auditLogs.map((entry) => (
                  <Card key={entry.id} className="transition-all hover:shadow-md">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2" />
                            <h3 className="font-medium text-foreground" data-testid={`text-audit-action-${entry.id}`}>
                              {entry.action}
                            </h3>
                          </div>
                          
                          {entry.fromStatus && entry.toStatus && (
                            <div className="ml-5 mb-2">
                              <div className="flex items-center space-x-2 text-sm">
                                <Badge variant="outline">{entry.fromStatus}</Badge>
                                <span className="text-muted-foreground">→</span>
                                <Badge variant="outline">{entry.toStatus}</Badge>
                              </div>
                            </div>
                          )}
                          
                          <div className="ml-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center space-x-1">
                              <User className="h-3 w-3" />
                              <span data-testid={`text-audit-user-${entry.id}`}>{entry.userId.slice(0, 8)}...</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span data-testid={`text-audit-time-${entry.id}`}>
                                {formatDistanceToNow(new Date(entry.timestamp))} ago
                              </span>
                            </div>
                            {entry.taskId && (
                              <div className="flex items-center space-x-1">
                                <FileText className="h-3 w-3" />
                                <span data-testid={`text-audit-task-${entry.id}`}>Task: {entry.taskId.slice(0, 8)}...</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="ml-4 flex-shrink-0">
                          <Shield className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}