/**
 * Usage Dashboard Component (T24)
 *
 * Displays AI usage statistics, billing information, and plan comparison.
 * Includes charts for usage breakdown by feature and provider.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import {
  Zap,
  Coins,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  PieChart,
  Clock,
  Sparkles,
  Crown,
  Building2
} from "lucide-react";

interface QuotaData {
  tier: string;
  usageToday: number;
  dailyLimit: number | null;
  percentUsed: number;
  remainingRequests: number | null;
  isUnlimited: boolean;
  resetTime: string;
}

interface UsageData {
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
  };
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: {
    estimated: number;
    currency: string;
  };
  performance: {
    avgDurationMs: number;
  };
  byProvider: Record<string, number>;
  byFeature: Record<string, number>;
}

interface PlanInfo {
  tier: string;
  name: string;
  description: string;
  features: string[];
  price: number | null;
  requestLimit: number | null;
  isCurrent: boolean;
}

// Tier badge colors
const TIER_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-800",
  pro: "bg-blue-100 text-blue-800",
  enterprise: "bg-purple-100 text-purple-800"
};

// Tier icons
const TIER_ICONS: Record<string, React.ReactNode> = {
  free: <Sparkles className="w-4 h-4" />,
  pro: <Crown className="w-4 h-4" />,
  enterprise: <Building2 className="w-4 h-4" />
};

// Feature color mapping for progress bars
const getFeatureColor = (feature: string): string => {
  const colorMap: Record<string, string> = {
    'product_description': 'bg-blue-600',
    'bullet_points': 'bg-green-600',
    'size_chart': 'bg-purple-600',
    'meta_title': 'bg-indigo-600',
    'meta_description': 'bg-cyan-600',
    'category_recommendation': 'bg-amber-600',
  };
  return colorMap[feature.toLowerCase()] || 'bg-gray-400';
};

// Provider color mapping for progress bars
const getProviderColor = (provider: string): string => {
  const colorMap: Record<string, string> = {
    'gemini': 'bg-blue-600',
    'openai': 'bg-green-600',
    'anthropic': 'bg-amber-600',
    'mistral': 'bg-purple-600',
  };
  return colorMap[provider.toLowerCase()] || 'bg-gray-400';
};

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-4 w-32" />
      </CardContent>
    </Card>
  );
}

export function UsageDashboard() {
  const [period, setPeriod] = useState("month");

  // Fetch quota status
  const { data: quotaData, isLoading: isLoadingQuota } = useQuery<{ quota: QuotaData }>({
    queryKey: ["/api/ai/quota"],
    queryFn: async () => {
      const res = await fetch("/api/ai/quota");
      if (!res.ok) throw new Error("Failed to fetch quota");
      return res.json();
    }
  });

  // Fetch usage statistics
  const { data: usageData, isLoading: isLoadingUsage } = useQuery<{ usage: UsageData }>({
    queryKey: ["/api/ai/usage", { period }],
    queryFn: async () => {
      const res = await fetch(`/api/ai/usage?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch usage");
      return res.json();
    }
  });

  // Fetch plan information
  const { data: plansData, isLoading: isLoadingPlans } = useQuery<{ plans: PlanInfo[]; currentTier: string }>({
    queryKey: ["/api/ai/plans"],
    queryFn: async () => {
      const res = await fetch("/api/ai/plans");
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    }
  });

  const quota = quotaData?.quota;
  const usage = usageData?.usage;
  const plans = plansData?.plans || [];
  const currentTier = plansData?.currentTier || "free";

  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Calculate time until reset
  const getTimeUntilReset = (resetTime: string) => {
    const reset = new Date(resetTime);
    const now = new Date();
    const diffMs = reset.getTime() - now.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Daily Quota Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoadingQuota ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : quota ? (
          <>
            {/* Current Tier */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Current Plan</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {TIER_ICONS[quota.tier]}
                  <span className="text-2xl font-bold capitalize">{quota.tier}</span>
                </div>
                <Badge className={`mt-2 ${TIER_COLORS[quota.tier]}`}>
                  {quota.isUnlimited ? "Unlimited" : `${quota.dailyLimit} req/day`}
                </Badge>
              </CardContent>
            </Card>

            {/* Daily Usage */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Today's Usage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {quota.usageToday}
                  {!quota.isUnlimited && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}/ {quota.dailyLimit}
                    </span>
                  )}
                </div>
                {!quota.isUnlimited && (
                  <Progress
                    value={quota.percentUsed}
                    className="mt-2"
                    aria-label={`${quota.percentUsed}% of daily limit used`}
                  />
                )}
                {quota.percentUsed >= 80 && !quota.isUnlimited && (
                  <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Approaching daily limit
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Reset Timer */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Quota Resets In</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {getTimeUntilReset(quota.resetTime)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Resets daily at midnight UTC
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Usage Statistics</h3>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]" aria-label="Select time period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Usage Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoadingUsage ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : usage ? (
          <>
            {/* Total Requests */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Zap className="w-4 h-4" />
                  Total Requests
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(usage.summary.totalRequests)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {usage.summary.successfulRequests} successful
                </p>
              </CardContent>
            </Card>

            {/* Token Usage */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <BarChart3 className="w-4 h-4" />
                  Tokens Used
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(usage.tokens.total)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(usage.tokens.input)} in / {formatNumber(usage.tokens.output)} out
                </p>
              </CardContent>
            </Card>

            {/* Estimated Cost */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Coins className="w-4 h-4" />
                  Estimated Cost
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(usage.cost.estimated)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Based on provider rates
                </p>
              </CardContent>
            </Card>

            {/* Success Rate */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Success Rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usage.summary.successRate}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {usage.summary.failedRequests} failures
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Usage Breakdown */}
      {usage && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* By Feature */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="w-4 h-4" />
                Usage by Feature
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(usage.byFeature).length > 0 ? (
                  Object.entries(usage.byFeature)
                    .sort(([, a], [, b]) => b - a)
                    .map(([feature, count]) => {
                      const total = Object.values(usage.byFeature).reduce((a, b) => a + b, 0);
                      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={feature}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="capitalize">{feature.replace(/_/g, " ")}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className={`h-2 rounded-full ${getFeatureColor(feature)}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No usage data yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* By Provider */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Usage by Provider
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(usage.byProvider).length > 0 ? (
                  Object.entries(usage.byProvider)
                    .sort(([, a], [, b]) => b - a)
                    .map(([provider, count]) => {
                      const total = Object.values(usage.byProvider).reduce((a, b) => a + b, 0);
                      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={provider}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="capitalize">{provider}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className={`h-2 rounded-full ${getProviderColor(provider)}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No usage data yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Plan Comparison */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Available Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isLoadingPlans ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            plans.map((plan) => (
              <Card
                key={plan.tier}
                className={`relative ${
                  plan.isCurrent ? "border-primary border-2" : ""
                }`}
              >
                {plan.isCurrent && (
                  <Badge className="absolute -top-2 left-4 bg-primary">
                    Current Plan
                  </Badge>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {TIER_ICONS[plan.tier]}
                    <CardTitle>{plan.name}</CardTitle>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-3xl font-bold">
                    {plan.price === null ? (
                      "Contact Sales"
                    ) : plan.price === 0 ? (
                      "Free"
                    ) : (
                      <>
                        ${plan.price}
                        <span className="text-sm font-normal text-muted-foreground">
                          /month
                        </span>
                      </>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {!plan.isCurrent && (
                    <Button className="w-full" variant={plan.tier === "pro" ? "default" : "outline"}>
                      {plan.price === null ? "Contact Sales" : "Upgrade"}
                      <ArrowUpRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default UsageDashboard;
