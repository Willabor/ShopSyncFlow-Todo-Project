import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CheckSquare, Clock, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, ChevronUp, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardStats } from "@shared/schema";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { designTokens } from "@/lib/design-tokens";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

// Transform API date format to chart format
const transformHistoryData = (history: Array<{date: string, value: number}>) => {
  return history.map((item, index) => ({
    day: index,
    value: item.value,
  }));
};

// Calculate trend percentage from transformed historical data
const calculateTrend = (data: Array<{day: number, value: number}>) => {
  if (data.length < 2) return 0;
  const firstValue = data[0].value;
  const lastValue = data[data.length - 1].value;
  if (firstValue === 0) return lastValue > 0 ? 100 : 0;
  return ((lastValue - firstValue) / firstValue) * 100;
};

export function StatsCards() {
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  // Use real historical data from API or empty arrays as fallback
  const totalTasksTrend = stats?.history?.totalTasks ? transformHistoryData(stats.history.totalTasks) : [];
  const pendingReviewTrend = stats?.history?.pendingReview ? transformHistoryData(stats.history.pendingReview) : [];
  const overdueSLATrend = stats?.history?.overdueSLA ? transformHistoryData(stats.history.overdueSLA) : [];
  const completedTodayTrend = stats?.history?.completedToday ? transformHistoryData(stats.history.completedToday) : [];

  // Calculate dynamic change text based on trends
  const totalTasksChange = totalTasksTrend.length > 0
    ? `${totalTasksTrend.length} days tracked`
    : "No history yet";

  const pendingReviewChange = stats?.pendingReview && stats.pendingReview > 0
    ? `${stats.pendingReview} awaiting review`
    : "All clear";

  const overdueSLAChange = stats?.overdueSLA && stats.overdueSLA > 0
    ? "Requires attention"
    : "No overdue tasks";

  const completedTodayChange = stats?.completedToday && stats.completedToday > 0
    ? `${stats.completedToday} completed today`
    : "None completed today";

  const statsCards = [
    {
      title: "Total Tasks",
      value: stats?.totalTasks || 0,
      icon: CheckSquare,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      chartColor: designTokens.colors.primary[500],
      trendData: totalTasksTrend,
      change: totalTasksChange,
      changeColor: "text-muted-foreground",
      testId: "stat-total-tasks"
    },
    {
      title: "Pending Review",
      value: stats?.pendingReview || 0,
      icon: Clock,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      chartColor: designTokens.colors.warning,
      trendData: pendingReviewTrend,
      change: pendingReviewChange,
      changeColor: stats?.pendingReview && stats.pendingReview > 0 ? "text-warning" : "text-muted-foreground",
      testId: "stat-pending-review"
    },
    {
      title: "Overdue SLA",
      value: stats?.overdueSLA || 0,
      icon: AlertTriangle,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
      chartColor: designTokens.colors.error,
      trendData: overdueSLATrend,
      change: overdueSLAChange,
      changeColor: stats?.overdueSLA && stats.overdueSLA > 0 ? "text-destructive" : "text-success",
      testId: "stat-overdue-sla"
    },
    {
      title: "Completed Today",
      value: stats?.completedToday || 0,
      icon: CheckCircle,
      iconBg: "bg-success/10",
      iconColor: "text-success",
      chartColor: designTokens.colors.success,
      trendData: completedTodayTrend,
      change: completedTodayChange,
      changeColor: stats?.completedToday && stats.completedToday > 0 ? "text-success" : "text-muted-foreground",
      testId: "stat-completed-today"
    }
  ];

  if (isLoading) {
    return (
      <div className="px-6 py-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="ml-3 space-y-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-6 w-10" />
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <Skeleton className="h-6 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-2">
      {/* Compact Header with Toggle */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Key Metrics</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-7 px-2"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              <span className="text-xs">Collapse</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              <span className="text-xs">Expand</span>
            </>
          )}
        </Button>
      </div>

      {/* Collapsible Stats Grid */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              {statsCards.map((stat) => {
                const Icon = stat.icon;
                const trend = calculateTrend(stat.trendData);
                const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown;
                const trendColor = trend >= 0 ? "text-success" : "text-destructive";

                return (
                  <Card key={stat.title} className="overflow-hidden hover:shadow-hover transition-shadow duration-200">
                    <CardContent className="p-3">
                      {/* Compact Header with icon and value */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <div className={`w-8 h-8 ${stat.iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`h-4 w-4 ${stat.iconColor}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground truncate">
                              {stat.title}
                            </p>
                            <p
                              className="text-xl font-bold text-foreground"
                              data-testid={stat.testId}
                            >
                              {stat.value}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Compact Sparkline Chart */}
                      {stat.trendData.length > 0 ? (
                        <div className="h-8 -mx-1 mb-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={stat.trendData}>
                              <Line
                                type="monotone"
                                dataKey="value"
                                stroke={stat.chartColor}
                                strokeWidth={1.5}
                                dot={false}
                                animationDuration={800}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-8 -mx-1 mb-2 flex items-center justify-center">
                          <p className="text-xs text-muted-foreground">No trend data yet</p>
                        </div>
                      )}

                      {/* Compact Footer */}
                      <div className="flex items-center justify-between text-xs">
                        <span className={stat.changeColor}>
                          {stat.change}
                        </span>
                        {stat.trendData.length >= 2 && (
                          <div className={`flex items-center gap-0.5 ${trendColor}`}>
                            <TrendIcon className="h-3 w-3" />
                            <span className="font-medium">
                              {Math.abs(trend).toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
