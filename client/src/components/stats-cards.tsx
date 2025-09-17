import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CheckSquare, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardStats } from "@shared/schema";

export function StatsCards() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const statsCards = [
    {
      title: "Total Tasks",
      value: stats?.totalTasks || 0,
      icon: CheckSquare,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      change: "+12% from last week",
      changeColor: "text-success",
      testId: "stat-total-tasks"
    },
    {
      title: "Pending Review",
      value: stats?.pendingReview || 0,
      icon: Clock,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      change: `${Math.floor((stats?.pendingReview || 0) * 0.35)} high priority`,
      changeColor: "text-muted-foreground",
      testId: "stat-pending-review"
    },
    {
      title: "Overdue SLA",
      value: stats?.overdueSLA || 0,
      icon: AlertTriangle,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
      change: "Requires attention",
      changeColor: "text-destructive",
      testId: "stat-overdue-sla"
    },
    {
      title: "Completed Today",
      value: stats?.completedToday || 0,
      icon: CheckCircle,
      iconBg: "bg-success/10",
      iconColor: "text-success",
      change: "+5% above target",
      changeColor: "text-success",
      testId: "stat-completed-today"
    }
  ];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="ml-4 space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-12" />
                  </div>
                </div>
                <div className="mt-4">
                  <Skeleton className="h-3 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className={`w-12 h-12 ${stat.iconBg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`h-6 w-6 ${stat.iconColor}`} />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </p>
                    <p 
                      className="text-2xl font-bold text-foreground" 
                      data-testid={stat.testId}
                    >
                      {stat.value}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <span className={`text-sm ${stat.changeColor}`}>
                    {stat.change}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
