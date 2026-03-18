import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeePerformanceCard } from "@/components/employee-performance-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Activity,
  Users,
  Package,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import type { DashboardStats, TaskWithDetails } from "@shared/schema";
import { useState } from "react";

export function AnalyticsTabContent() {
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<string>("score");

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    enabled: !!user,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<TaskWithDetails[]>({
    queryKey: ["/api/tasks"],
    enabled: !!user,
  });

  const { data: employeePerformance = [], isLoading: employeeLoading } = useQuery<any[]>({
    queryKey: ["/api/analytics/employee-performance"],
    enabled: !!user && user.role === "SuperAdmin",
  });

  const { data: teamAverages } = useQuery<any>({
    queryKey: ["/api/analytics/team-averages"],
    enabled: !!user && user.role === "SuperAdmin",
  });

  const { data: completionLeaderboard = [] } = useQuery<any[]>({
    queryKey: ["/api/analytics/leaderboard/completion"],
    enabled: !!user && user.role === "SuperAdmin",
  });

  const { data: speedLeaderboard = [] } = useQuery<any[]>({
    queryKey: ["/api/analytics/leaderboard/speed"],
    enabled: !!user && user.role === "SuperAdmin",
  });

  const { data: qualityLeaderboard = [] } = useQuery<any[]>({
    queryKey: ["/api/analytics/leaderboard/quality"],
    enabled: !!user && user.role === "SuperAdmin",
  });

  // Calculate analytics data
  const getAnalyticsData = () => {
    if (!tasks.length) return null;

    // Task completion over time (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    const completionData = last7Days.map(date => {
      const completed = tasks.filter(task =>
        task.completedAt &&
        task.completedAt.toString().startsWith(date)
      ).length;
      return {
        date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        completed
      };
    });

    // Status distribution
    const statusData = Object.entries(stats?.kanbanCounts || {}).map(([status, count]) => ({
      name: status.replace('_', ' '),
      value: count,
      color: getStatusColor(status)
    }));

    // Lead time analysis
    const leadTimes = tasks
      .filter(task => task.leadTimeMinutes)
      .map(task => ({
        title: task.title.slice(0, 20) + '...',
        leadTime: Math.round(task.leadTimeMinutes! / 60), // Convert to hours
        cycleTime: Math.round((task.cycleTimeMinutes || 0) / 60)
      }))
      .slice(0, 10);

    return { completionData, statusData, leadTimes };
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      NEW: "#64748b",
      TRIAGE: "#f59e0b",
      ASSIGNED: "#3b82f6",
      IN_PROGRESS: "#8b5cf6",
      READY_FOR_REVIEW: "#f59e0b",
      PUBLISHED: "#10b981",
      QA_APPROVED: "#059669",
      DONE: "#22c55e"
    };
    return colors[status] || "#64748b";
  };

  const analyticsData = getAnalyticsData();

  // Sort and calculate employee performance
  const sortedEmployees = [...employeePerformance].sort((a, b) => {
    const getScore = (emp: any) => {
      const completionWeight = emp.metrics.completionRate * 0.6;
      const speedScore = emp.metrics.avgCycleTimeHours > 0
        ? Math.min(100, (24 / emp.metrics.avgCycleTimeHours) * 40)
        : 0;
      return completionWeight + speedScore;
    };

    switch (sortBy) {
      case 'score':
        return getScore(b) - getScore(a);
      case 'completion':
        return b.metrics.completionRate - a.metrics.completionRate;
      case 'tasks':
        return b.metrics.completedTasks - a.metrics.completedTasks;
      case 'name':
        const nameA = a.employee.firstName || a.employee.username;
        const nameB = b.employee.firstName || b.employee.username;
        return nameA.localeCompare(nameB);
      default:
        return 0;
    }
  });

  const isLoading = statsLoading || tasksLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Analytics Dashboard</h3>
        <p className="text-sm text-muted-foreground">
          Comprehensive insights into workflow performance and team productivity
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="ml-4 space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-12" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Package className="h-6 w-6 text-primary" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="analytics-total-tasks">
                      {stats?.totalTasks || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                    <Clock className="h-6 w-6 text-warning" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="analytics-pending-review">
                      {stats?.pendingReview || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Overdue SLA</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="analytics-overdue-sla">
                      {stats?.overdueSLA || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-success" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Completed Today</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="analytics-completed-today">
                      {stats?.completedToday || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Employee Performance Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Employee Performance</h2>
              <p className="text-sm text-muted-foreground">Individual productivity and efficiency metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Efficiency Score</SelectItem>
                <SelectItem value="completion">Completion Rate</SelectItem>
                <SelectItem value="tasks">Tasks Completed</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {employeeLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <Skeleton className="h-4 w-32 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sortedEmployees.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Employee Data</h3>
              <p className="text-muted-foreground">
                Employee performance data will appear here once team members are assigned tasks.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedEmployees.map((data) => (
              <EmployeePerformanceCard
                key={data.employee.id}
                employee={data.employee}
                metrics={data.metrics}
              />
            ))}
          </div>
        )}
      </div>

      {/* Team Averages Section */}
      {teamAverages && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Activity className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Team Performance Averages</h2>
              <p className="text-sm text-muted-foreground">Compare individual performance against team benchmarks</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Avg Completion Rate</p>
                <p className="text-2xl font-bold text-foreground">{teamAverages.avgCompletionRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Avg Cycle Time</p>
                <p className="text-2xl font-bold text-foreground">{teamAverages.avgCycleTimeHours}h</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Avg Rework Rate</p>
                <p className="text-2xl font-bold text-foreground">{teamAverages.avgReworkRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Avg On-Time Rate</p>
                <p className="text-2xl font-bold text-foreground">{teamAverages.avgOnTimeDeliveryRate}%</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Leaderboards Section */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Performance Leaderboards</h2>
            <p className="text-sm text-muted-foreground">Top performers across key metrics</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Most Productive */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Most Tasks Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {completionLeaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                ) : (
                  completionLeaderboard.map((entry) => (
                    <div key={entry.employee.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0">
                          {entry.rank}
                        </Badge>
                        <span className="text-sm font-medium">
                          {entry.employee.firstName} {entry.employee.lastName}
                        </span>
                      </div>
                      <Badge variant="secondary">{entry.value} tasks</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fastest Workers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Fastest Cycle Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {speedLeaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                ) : (
                  speedLeaderboard.map((entry) => (
                    <div key={entry.employee.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0">
                          {entry.rank}
                        </Badge>
                        <span className="text-sm font-medium">
                          {entry.employee.firstName} {entry.employee.lastName}
                        </span>
                      </div>
                      <Badge variant="secondary">{entry.value.toFixed(1)}h</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Best Quality */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-500" />
                Best Quality (Low Rework)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {qualityLeaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                ) : (
                  qualityLeaderboard.map((entry) => (
                    <div key={entry.employee.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0">
                          {entry.rank}
                        </Badge>
                        <span className="text-sm font-medium">
                          {entry.employee.firstName} {entry.employee.lastName}
                        </span>
                      </div>
                      <Badge variant="secondary">{entry.value.toFixed(1)}%</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 mt-8">
        {/* Task Completion Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="mr-2 h-5 w-5" />
              Task Completion Trend (7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !analyticsData ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={analyticsData.completionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: "#3b82f6" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="mr-2 h-5 w-5" />
              Task Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !analyticsData ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={analyticsData.statusData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {analyticsData.statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lead Time Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="mr-2 h-5 w-5" />
            Lead Time Analysis (Recent Tasks)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !analyticsData ? (
            <Skeleton className="h-64 w-full" />
          ) : analyticsData.leadTimes.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No completed tasks with lead time data available yet.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData.leadTimes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="title" />
                <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Bar dataKey="leadTime" fill="#3b82f6" name="Lead Time" />
                <Bar dataKey="cycleTime" fill="#10b981" name="Cycle Time" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Performance Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Performance Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Average Lead Time</span>
                <Badge variant="secondary">
                  {analyticsData?.leadTimes.length
                    ? `${Math.round(analyticsData.leadTimes.reduce((acc, task) => acc + task.leadTime, 0) / analyticsData.leadTimes.length)}h`
                    : "N/A"
                  }
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tasks in Progress</span>
                <Badge variant="secondary">
                  {stats?.kanbanCounts?.IN_PROGRESS || 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">SLA Breach Rate</span>
                <Badge variant={stats?.overdueSLA ? "destructive" : "secondary"}>
                  {stats?.totalTasks
                    ? `${Math.round(((stats.overdueSLA || 0) / stats.totalTasks) * 100)}%`
                    : "0%"
                  }
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Tasks</span>
                <Badge variant="default">
                  {(stats?.totalTasks || 0) - (stats?.kanbanCounts?.DONE || 0)}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Completion Rate</span>
                <Badge variant="secondary">
                  {stats?.totalTasks
                    ? `${Math.round(((stats.kanbanCounts?.DONE || 0) / stats.totalTasks) * 100)}%`
                    : "0%"
                  }
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Queue Health</span>
                <Badge variant={(stats?.pendingReview || 0) > 10 ? "destructive" : "secondary"}>
                  {(stats?.pendingReview || 0) > 10 ? "Needs Attention" : "Good"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
