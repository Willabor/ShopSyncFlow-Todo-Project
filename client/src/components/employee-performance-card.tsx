import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Clock,
  CheckCircle,
  Activity,
  ChevronRight
} from "lucide-react";

interface EmployeeMetrics {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  completionRate: number;
  avgCycleTimeHours: number;
  avgLeadTimeHours: number;
  tasksLast30Days: number;
  onTimeDeliveryRate: number;
  // Phase 2: Quality metrics
  reworkRate: number;
  firstTimeSuccessRate: number;
  avgSLAPerformanceHours: number;
}

interface Employee {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

interface EmployeePerformanceCardProps {
  employee: Employee;
  metrics: EmployeeMetrics;
  onViewDetails?: (employeeId: string) => void;
}

export function EmployeePerformanceCard({ employee, metrics, onViewDetails }: EmployeePerformanceCardProps) {
  const getInitials = () => {
    if (employee.firstName && employee.lastName) {
      return (employee.firstName[0] + employee.lastName[0]).toUpperCase();
    }
    return employee.username.slice(0, 2).toUpperCase();
  };

  const getDisplayName = () => {
    if (employee.firstName && employee.lastName) {
      return `${employee.firstName} ${employee.lastName}`;
    }
    return employee.username;
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'WarehouseManager':
        return 'bg-blue-500';
      case 'Editor':
        return 'bg-purple-500';
      case 'Auditor':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
    switch (role) {
      case 'WarehouseManager':
        return 'default';
      case 'Editor':
        return 'secondary';
      case 'Auditor':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getCompletionRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 75) return 'text-blue-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getEfficiencyScore = () => {
    // Simple efficiency score based on completion rate and speed
    const completionWeight = metrics.completionRate * 0.6;
    const speedScore = metrics.avgCycleTimeHours > 0
      ? Math.min(100, (24 / metrics.avgCycleTimeHours) * 40) // 40% weight
      : 0;
    return Math.round(completionWeight + speedScore);
  };

  const efficiencyScore = getEfficiencyScore();

  const getEfficiencyBadge = (score: number) => {
    if (score >= 90) return { variant: 'default' as const, label: 'Excellent', color: 'bg-green-500' };
    if (score >= 75) return { variant: 'default' as const, label: 'Strong', color: 'bg-blue-500' };
    if (score >= 60) return { variant: 'secondary' as const, label: 'Good', color: 'bg-yellow-500' };
    return { variant: 'destructive' as const, label: 'Needs Help', color: 'bg-red-500' };
  };

  const efficiency = getEfficiencyBadge(efficiencyScore);

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className={`${getRoleColor(employee.role)} text-white font-semibold`}>
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-foreground">{getDisplayName()}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={getRoleBadgeVariant(employee.role)} className="text-xs">
                  {employee.role}
                </Badge>
                <Badge variant={efficiency.variant} className="text-xs">
                  {efficiency.label}
                </Badge>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">{efficiencyScore}</div>
            <div className="text-xs text-muted-foreground">Score</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Completion Rate */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Completion</span>
            </div>
            <div className={`text-xl font-bold ${getCompletionRateColor(metrics.completionRate)}`}>
              {metrics.completionRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {metrics.completedTasks}/{metrics.totalTasks} tasks
            </div>
          </div>

          {/* Avg Cycle Time */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Time</span>
            </div>
            <div className="text-xl font-bold text-foreground">
              {metrics.avgCycleTimeHours.toFixed(1)}h
            </div>
            <div className="text-xs text-muted-foreground">per task</div>
          </div>

          {/* Recent Activity */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Last 30 Days</span>
            </div>
            <div className="text-xl font-bold text-foreground">
              {metrics.tasksLast30Days}
            </div>
            <div className="text-xs text-muted-foreground">completed</div>
          </div>

          {/* Current Workload */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">In Progress</span>
            </div>
            <div className="text-xl font-bold text-foreground">
              {metrics.inProgressTasks}
            </div>
            <div className="text-xs text-muted-foreground">
              {metrics.inProgressTasks > 5 ? 'Heavy load' : 'Active'}
            </div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">On-Time Delivery</span>
            <span className={`font-semibold ${
              metrics.onTimeDeliveryRate >= 90 ? 'text-green-600' :
              metrics.onTimeDeliveryRate >= 75 ? 'text-blue-600' : 'text-yellow-600'
            }`}>
              {metrics.onTimeDeliveryRate > 0 ? `${metrics.onTimeDeliveryRate.toFixed(0)}%` : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Avg Lead Time</span>
            <span className="font-semibold text-foreground">
              {metrics.avgLeadTimeHours.toFixed(1)}h
            </span>
          </div>
        </div>

        {/* Quality Metrics (Phase 2) */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">First-Time Success</span>
            <span className={`font-semibold ${
              metrics.firstTimeSuccessRate >= 95 ? 'text-green-600' :
              metrics.firstTimeSuccessRate >= 85 ? 'text-blue-600' :
              metrics.firstTimeSuccessRate >= 75 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {metrics.firstTimeSuccessRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Rework Rate</span>
            <span className={`font-semibold ${
              metrics.reworkRate <= 5 ? 'text-green-600' :
              metrics.reworkRate <= 10 ? 'text-blue-600' :
              metrics.reworkRate <= 20 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {metrics.reworkRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">SLA Performance</span>
            <span className={`font-semibold ${
              metrics.avgSLAPerformanceHours > 0 ? 'text-green-600' :
              metrics.avgSLAPerformanceHours >= -2 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {metrics.avgSLAPerformanceHours === 0 ? 'N/A' :
               metrics.avgSLAPerformanceHours > 0 ? `+${metrics.avgSLAPerformanceHours.toFixed(1)}h early` :
               `${Math.abs(metrics.avgSLAPerformanceHours).toFixed(1)}h late`}
            </span>
          </div>
        </div>

        {/* View Details Button */}
        {onViewDetails && (
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={() => onViewDetails(employee.id)}
          >
            View Details
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
