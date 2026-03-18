import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  User,
  Users,
  FileCheck,
  TrendingUp,
  Play,
  Pause,
  RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowStage {
  id: string;
  label: string;
  color: string;
  description: string;
}

interface RoleTransitions {
  [role: string]: {
    [stage: string]: string[];
  };
}

const STAGES: WorkflowStage[] = [
  {
    id: "NEW",
    label: "NEW",
    color: "bg-blue-100 border-blue-500 text-blue-700",
    description: "Task created, awaiting triage"
  },
  {
    id: "TRIAGE",
    label: "TRIAGE",
    color: "bg-purple-100 border-purple-500 text-purple-700",
    description: "Available for editors to claim"
  },
  {
    id: "ASSIGNED",
    label: "ASSIGNED",
    color: "bg-yellow-100 border-yellow-500 text-yellow-700",
    description: "Claimed by editor (48hr limit)"
  },
  {
    id: "IN_PROGRESS",
    label: "IN PROGRESS",
    color: "bg-orange-100 border-orange-500 text-orange-700",
    description: "Editor actively working"
  },
  {
    id: "READY_FOR_REVIEW",
    label: "READY FOR REVIEW",
    color: "bg-cyan-100 border-cyan-500 text-cyan-700",
    description: "Awaiting manager approval"
  },
  {
    id: "PUBLISHED",
    label: "PUBLISHED",
    color: "bg-indigo-100 border-indigo-500 text-indigo-700",
    description: "Live on Shopify, awaiting QA"
  },
  {
    id: "QA_APPROVED",
    label: "QA APPROVED",
    color: "bg-green-100 border-green-500 text-green-700",
    description: "Verified by auditor"
  },
  {
    id: "DONE",
    label: "DONE",
    color: "bg-gray-100 border-gray-500 text-gray-700",
    description: "Task complete"
  }
];

const ROLES = [
  {
    id: "SuperAdmin",
    name: "SuperAdmin",
    icon: TrendingUp,
    color: "text-red-600 bg-red-50 border-red-200",
    description: "Full system access"
  },
  {
    id: "WarehouseManager",
    name: "Warehouse Manager",
    icon: Users,
    color: "text-blue-600 bg-blue-50 border-blue-200",
    description: "Creates tasks, approves work"
  },
  {
    id: "Editor",
    name: "Editor",
    icon: User,
    color: "text-green-600 bg-green-50 border-green-200",
    description: "Claims and completes tasks"
  },
  {
    id: "Auditor",
    name: "Auditor",
    icon: FileCheck,
    color: "text-purple-600 bg-purple-50 border-purple-200",
    description: "Quality verification"
  }
];

const TRANSITIONS: RoleTransitions = {
  SuperAdmin: {
    NEW: ["TRIAGE", "ASSIGNED", "DONE"],
    TRIAGE: ["ASSIGNED", "NEW", "DONE"],
    ASSIGNED: ["IN_PROGRESS", "TRIAGE", "DONE"],
    IN_PROGRESS: ["READY_FOR_REVIEW", "ASSIGNED", "DONE"],
    READY_FOR_REVIEW: ["PUBLISHED", "IN_PROGRESS", "QA_APPROVED"],
    PUBLISHED: ["QA_APPROVED", "READY_FOR_REVIEW", "DONE"],
    QA_APPROVED: ["DONE", "PUBLISHED"],
    DONE: ["QA_APPROVED", "PUBLISHED", "IN_PROGRESS"]
  },
  WarehouseManager: {
    NEW: ["TRIAGE", "ASSIGNED"],
    TRIAGE: ["ASSIGNED", "NEW"],
    ASSIGNED: ["IN_PROGRESS", "TRIAGE"],
    IN_PROGRESS: ["READY_FOR_REVIEW", "ASSIGNED"],
    READY_FOR_REVIEW: ["PUBLISHED", "IN_PROGRESS"],
    PUBLISHED: ["QA_APPROVED"],
    QA_APPROVED: [],
    DONE: ["QA_APPROVED", "PUBLISHED"]
  },
  Editor: {
    NEW: [],
    TRIAGE: ["ASSIGNED"],
    ASSIGNED: ["IN_PROGRESS", "TRIAGE"],
    IN_PROGRESS: ["READY_FOR_REVIEW", "ASSIGNED"],
    READY_FOR_REVIEW: [],
    PUBLISHED: [],
    QA_APPROVED: [],
    DONE: []
  },
  Auditor: {
    NEW: [],
    TRIAGE: [],
    ASSIGNED: [],
    IN_PROGRESS: [],
    READY_FOR_REVIEW: ["IN_PROGRESS"],
    PUBLISHED: ["QA_APPROVED", "READY_FOR_REVIEW"],
    QA_APPROVED: ["DONE"],
    DONE: []
  }
};

const SCENARIOS = {
  SuperAdmin: [
    { from: "NEW", to: "TRIAGE", label: "Release task to editors" },
    { from: "DONE", to: "IN_PROGRESS", label: "Reopen completed task" }
  ],
  WarehouseManager: [
    { from: "NEW", to: "TRIAGE", label: "Make task available" },
    { from: "READY_FOR_REVIEW", to: "PUBLISHED", label: "Approve work" },
    { from: "READY_FOR_REVIEW", to: "IN_PROGRESS", label: "Request changes" }
  ],
  Editor: [
    { from: "TRIAGE", to: "ASSIGNED", label: "Claim task (max 2)" },
    { from: "ASSIGNED", to: "IN_PROGRESS", label: "Start working" },
    { from: "IN_PROGRESS", to: "READY_FOR_REVIEW", label: "Submit for review" },
    { from: "ASSIGNED", to: "TRIAGE", label: "Release task" }
  ],
  Auditor: [
    { from: "PUBLISHED", to: "QA_APPROVED", label: "Approve QA" },
    { from: "QA_APPROVED", to: "DONE", label: "Close task" },
    { from: "PUBLISHED", to: "READY_FOR_REVIEW", label: "Reject QA" }
  ]
};

export function InteractiveWorkflow() {
  const [selectedRole, setSelectedRole] = useState<string>("Editor");
  const [highlightedStage, setHighlightedStage] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationStep, setAnimationStep] = useState(0);

  const editorJourney = ["TRIAGE", "ASSIGNED", "IN_PROGRESS", "READY_FOR_REVIEW"];

  useEffect(() => {
    if (isAnimating) {
      const timer = setTimeout(() => {
        if (animationStep < editorJourney.length - 1) {
          setAnimationStep(animationStep + 1);
        } else {
          setIsAnimating(false);
          setAnimationStep(0);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isAnimating, animationStep]);

  const startAnimation = () => {
    setAnimationStep(0);
    setIsAnimating(true);
    setSelectedRole("Editor");
  };

  const stopAnimation = () => {
    setIsAnimating(false);
    setAnimationStep(0);
  };

  const resetAnimation = () => {
    setIsAnimating(false);
    setAnimationStep(0);
  };

  const canTransition = (from: string, to: string): boolean => {
    if (!selectedRole) return false;
    const transitions = TRANSITIONS[selectedRole];
    if (!transitions || !transitions[from]) return false;
    return transitions[from].includes(to);
  };

  const isHighlighted = (stageId: string): boolean => {
    if (isAnimating) {
      return editorJourney[animationStep] === stageId;
    }
    if (highlightedStage) {
      // Show highlighted stage and its valid transitions
      if (stageId === highlightedStage) return true;
      return canTransition(highlightedStage, stageId);
    }
    return false;
  };

  const getStageOpacity = (stageId: string): string => {
    if (isAnimating || highlightedStage) {
      return isHighlighted(stageId) ? "opacity-100" : "opacity-30";
    }
    return "opacity-100";
  };

  const scenarios = SCENARIOS[selectedRole as keyof typeof SCENARIOS] || [];

  return (
    <div className="space-y-8">
      {/* Role Selection */}
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">Select a Role to Explore</h3>
          <p className="text-sm text-muted-foreground">
            Click a role to see their allowed workflow transitions
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="radiogroup" aria-label="Select a role to explore workflow permissions">
          {ROLES.map((role) => {
            const Icon = role.icon;
            const isSelected = selectedRole === role.id;
            return (
              <button
                key={role.id}
                onClick={() => {
                  setSelectedRole(role.id);
                  setHighlightedStage(null);
                  stopAnimation();
                }}
                className={cn(
                  "flex flex-col items-center p-4 rounded-lg border-2 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isSelected
                    ? role.color + " ring-2 ring-offset-2"
                    : "bg-background border-border hover:border-primary/50"
                )}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${role.name}: ${role.description}`}
              >
                <Icon className={cn(
                  "h-8 w-8 mb-2",
                  isSelected ? role.color.split(' ')[0] : "text-muted-foreground"
                )} aria-hidden="true" />
                <span className="font-semibold text-sm text-foreground">{role.name}</span>
                <span className="text-xs text-muted-foreground mt-1">{role.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Animation Controls */}
      {selectedRole === "Editor" && (
        <div className="flex justify-center gap-3">
          <Button
            onClick={startAnimation}
            disabled={isAnimating}
            size="sm"
            variant="outline"
          >
            <Play className="mr-2 h-4 w-4" />
            Watch Editor Journey
          </Button>
          {isAnimating && (
            <Button onClick={stopAnimation} size="sm" variant="outline">
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </Button>
          )}
          {animationStep > 0 && !isAnimating && (
            <Button onClick={resetAnimation} size="sm" variant="outline">
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          )}
        </div>
      )}

      {/* Workflow Stages */}
      <div className="relative" role="region" aria-label="Workflow stages visualization">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STAGES.map((stage, index) => (
            <div key={stage.id} className="relative">
              <button
                onClick={() => {
                  if (!isAnimating) {
                    setHighlightedStage(highlightedStage === stage.id ? null : stage.id);
                  }
                }}
                disabled={isAnimating}
                className={cn(
                  "w-full p-4 rounded-lg border-2 transition-all duration-300 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  stage.color,
                  getStageOpacity(stage.id),
                  highlightedStage === stage.id && "ring-2 ring-offset-2 shadow-lg scale-105",
                  !isAnimating && "hover:shadow-md hover:scale-105"
                )}
                aria-label={`Stage ${index + 1}: ${stage.label}. ${stage.description}. ${highlightedStage === stage.id ? 'Currently selected.' : 'Click to see available transitions.'}`}
                aria-pressed={highlightedStage === stage.id}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {stage.label}
                  </span>
                  <span className="text-xl font-bold">{index + 1}</span>
                </div>
                <p className="text-xs opacity-80 leading-tight">{stage.description}</p>

                {/* Show valid transitions when highlighted */}
                {highlightedStage === stage.id && !isAnimating && (
                  <div className="mt-3 pt-3 border-t border-current/20">
                    <p className="text-xs font-semibold mb-2">Can move to:</p>
                    <div className="flex flex-wrap gap-1">
                      {TRANSITIONS[selectedRole]?.[stage.id]?.length > 0 ? (
                        TRANSITIONS[selectedRole][stage.id].map((targetId) => {
                          const target = STAGES.find(s => s.id === targetId);
                          return (
                            <Badge key={targetId} variant="secondary" className="text-xs">
                              {target?.label}
                            </Badge>
                          );
                        })
                      ) : (
                        <span className="text-xs opacity-60">No transitions allowed</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Animation indicator */}
                {isAnimating && editorJourney[animationStep] === stage.id && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary rounded-full animate-pulse flex items-center justify-center">
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                  </div>
                )}
              </button>

              {/* Arrow between stages */}
              {index < STAGES.length - 1 && index % 4 !== 3 && (
                <div className={cn(
                  "hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 translate-x-1/2 z-10 transition-opacity duration-300",
                  getStageOpacity(stage.id)
                )}>
                  <ArrowRight className={cn(
                    "h-6 w-6",
                    (highlightedStage === stage.id && canTransition(stage.id, STAGES[index + 1].id)) ||
                    (isAnimating && animationStep === index)
                      ? "text-primary animate-pulse"
                      : "text-muted-foreground"
                  )} />
                </div>
              )}

              {/* Down arrow for row breaks */}
              {(index === 3) && (
                <div className={cn(
                  "hidden md:block absolute -bottom-2 left-1/2 transform translate-y-full -translate-x-1/2 z-10 transition-opacity duration-300",
                  getStageOpacity(stage.id)
                )}>
                  <div className="flex flex-col items-center">
                    <ArrowRight className="h-6 w-6 text-muted-foreground transform rotate-90" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Current Animation Step */}
      {isAnimating && (
        <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
          <p className="font-semibold text-foreground">
            Step {animationStep + 1} of {editorJourney.length}:
            <span className="text-primary ml-2">
              {animationStep === 0 && "Editor claims task from TRIAGE"}
              {animationStep === 1 && "Task reserved in ASSIGNED (48hr limit starts)"}
              {animationStep === 2 && "Editor starts working on task"}
              {animationStep === 3 && "Editor submits work for review"}
            </span>
          </p>
        </div>
      )}

      {/* Role-Specific Scenarios */}
      <div className="bg-muted/30 rounded-lg p-6">
        <h4 className="font-semibold text-foreground mb-4">
          {ROLES.find(r => r.id === selectedRole)?.name} Common Actions
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {scenarios.map((scenario, index) => {
            const fromStage = STAGES.find(s => s.id === scenario.from);
            const toStage = STAGES.find(s => s.id === scenario.to);
            return (
              <Card key={index} className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setHighlightedStage(scenario.from);
                  stopAnimation();
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 flex-1">
                    <Badge variant="outline" className="text-xs font-mono">
                      {fromStage?.label}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="outline" className="text-xs font-mono">
                      {toStage?.label}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{scenario.label}</p>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Key Features Callouts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-white font-bold text-sm">2</span>
            </div>
            <div>
              <h5 className="font-semibold text-sm text-foreground mb-1">Task Limit</h5>
              <p className="text-xs text-muted-foreground">
                Editors can only claim 2 tasks at once in ASSIGNED status
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-orange-50 border-orange-200">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-white font-bold text-sm">48</span>
            </div>
            <div>
              <h5 className="font-semibold text-sm text-foreground mb-1">Time Limit</h5>
              <p className="text-xs text-muted-foreground">
                Tasks in ASSIGNED auto-return to TRIAGE after 48 hours
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-green-50 border-green-200">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
              <FileCheck className="h-4 w-4 text-white" />
            </div>
            <div>
              <h5 className="font-semibold text-sm text-foreground mb-1">Full Audit Trail</h5>
              <p className="text-xs text-muted-foreground">
                Every transition logged with user, timestamp, and changes
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Instructions */}
      <div className="text-center text-sm text-muted-foreground space-y-2">
        <p>
          <strong>Tip:</strong> Click on any workflow stage to see where {ROLES.find(r => r.id === selectedRole)?.name.toLowerCase()} can move tasks from that stage
        </p>
        {selectedRole === "Editor" && (
          <p className="text-primary">
            Click "Watch Editor Journey" to see an animated demonstration of the typical editor workflow
          </p>
        )}
      </div>
    </div>
  );
}
