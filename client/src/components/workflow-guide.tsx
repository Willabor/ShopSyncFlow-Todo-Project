import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle, XCircle, ArrowRight, Shield, Users, Edit, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface WorkflowStep {
  status: string;
  label: string;
  description: string;
  color: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  { status: "NEW", label: "New", description: "Task created", color: "bg-secondary" },
  { status: "TRIAGE", label: "Triage", description: "Under review", color: "bg-yellow-500" },
  { status: "ASSIGNED", label: "Assigned", description: "Assigned to team member", color: "bg-blue-500" },
  { status: "IN_PROGRESS", label: "In Progress", description: "Work started", color: "bg-purple-500" },
  { status: "READY_FOR_REVIEW", label: "Ready for Review", description: "Submitted for review", color: "bg-orange-500" },
  { status: "PUBLISHED", label: "Published", description: "Live on Shopify", color: "bg-green-500" },
  { status: "QA_APPROVED", label: "QA Approved", description: "Quality approved", color: "bg-emerald-600" },
  { status: "DONE", label: "Done", description: "Completed", color: "bg-green-700" },
];

const ROLE_INFO = {
  SuperAdmin: {
    icon: Shield,
    color: "text-red-500",
    description: "Full system access with override capabilities",
    canDo: [
      "Move tasks to any status at any time",
      "Skip workflow steps when necessary",
      "Close/cancel tasks from any stage",
      "Reopen completed tasks for corrections",
      "Manage all users and teams",
      "Access all features and analytics",
      "Override any workflow restrictions"
    ],
    cannotDo: [
      "No restrictions - full administrative access"
    ],
    transitions: {
      NEW: ["TRIAGE", "ASSIGNED", "DONE"],
      TRIAGE: ["ASSIGNED", "NEW", "DONE"],
      ASSIGNED: ["IN_PROGRESS", "TRIAGE", "DONE"],
      IN_PROGRESS: ["READY_FOR_REVIEW", "ASSIGNED", "DONE"],
      READY_FOR_REVIEW: ["PUBLISHED", "IN_PROGRESS", "QA_APPROVED"],
      PUBLISHED: ["QA_APPROVED", "READY_FOR_REVIEW", "DONE"],
      QA_APPROVED: ["DONE", "PUBLISHED"],
      DONE: ["QA_APPROVED", "PUBLISHED", "IN_PROGRESS"]
    },
    workflow: "SuperAdmin can move tasks freely through the workflow, including skipping steps or closing tasks early when needed."
  },
  WarehouseManager: {
    icon: Users,
    color: "text-blue-500",
    description: "Team management and workflow coordination",
    canDo: [
      "Create and assign tasks",
      "Move tasks through early workflow stages",
      "Manage NEW → TRIAGE → ASSIGNED → IN_PROGRESS",
      "Send tasks back for revision",
      "Reopen completed tasks for QA review",
      "Manage team members",
      "View analytics and reports"
    ],
    cannotDo: [
      "Cannot mark tasks as DONE (requires QA approval)",
      "Cannot approve QA or final completion",
      "Cannot reopen tasks to IN_PROGRESS from DONE"
    ],
    transitions: {
      NEW: ["TRIAGE", "ASSIGNED"],
      TRIAGE: ["ASSIGNED", "NEW"],
      ASSIGNED: ["IN_PROGRESS", "TRIAGE"],
      IN_PROGRESS: ["READY_FOR_REVIEW", "ASSIGNED"],
      READY_FOR_REVIEW: ["PUBLISHED", "IN_PROGRESS"],
      PUBLISHED: ["QA_APPROVED"],
      QA_APPROVED: [],
      DONE: ["QA_APPROVED", "PUBLISHED"]
    },
    workflow: "WarehouseManager guides tasks through initial stages but hands off to Auditors for final approval."
  },
  Editor: {
    icon: Edit,
    color: "text-purple-500",
    description: "Content creation and task execution",
    canDo: [
      "Work on assigned tasks",
      "Move tasks IN_PROGRESS → READY_FOR_REVIEW",
      "Submit work for review",
      "Send tasks back to ASSIGNED for revision",
      "Update task details and content"
    ],
    cannotDo: [
      "Cannot create or assign tasks",
      "Cannot move tasks through triage",
      "Cannot publish or approve tasks",
      "Cannot mark tasks as DONE",
      "Cannot access team management"
    ],
    transitions: {
      NEW: [],
      TRIAGE: [],
      ASSIGNED: ["IN_PROGRESS"],
      IN_PROGRESS: ["READY_FOR_REVIEW", "ASSIGNED"],
      READY_FOR_REVIEW: [],
      PUBLISHED: [],
      QA_APPROVED: [],
      DONE: []
    },
    workflow: "Editor focuses on executing assigned work and submitting for review. Limited to active work stages only."
  },
  Auditor: {
    icon: Search,
    color: "text-green-500",
    description: "Quality assurance and final approval",
    canDo: [
      "Review submitted work",
      "Send tasks back for revision (READY_FOR_REVIEW → IN_PROGRESS)",
      "Move published items through QA approval",
      "Mark QA approved tasks as DONE",
      "Access audit logs and compliance reports",
      "Final approval authority"
    ],
    cannotDo: [
      "Cannot create or assign tasks",
      "Cannot work on tasks (cannot move to IN_PROGRESS)",
      "Cannot publish directly (only approve after publishing)",
      "Cannot manage team or users"
    ],
    transitions: {
      NEW: [],
      TRIAGE: [],
      ASSIGNED: [],
      IN_PROGRESS: [],
      READY_FOR_REVIEW: ["IN_PROGRESS"],
      PUBLISHED: ["QA_APPROVED", "READY_FOR_REVIEW"],
      QA_APPROVED: ["DONE"],
      DONE: []
    },
    workflow: "Auditor ensures quality control at the end of the workflow, with final approval authority to mark tasks as DONE."
  }
};

export function WorkflowGuide() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const roleInfo = ROLE_INFO[user.role as keyof typeof ROLE_INFO];
  if (!roleInfo) return null;

  const RoleIcon = roleInfo.icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          data-testid="button-workflow-guide"
        >
          <HelpCircle className="h-4 w-4" />
          Workflow Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-primary/10`}>
              <RoleIcon className={`h-6 w-6 ${roleInfo.color}`} />
            </div>
            <div>
              <DialogTitle className="text-2xl">
                {user.role === "SuperAdmin" ? "Super Admin" : user.role} Workflow Guide
              </DialogTitle>
              <DialogDescription className="text-base">
                {roleInfo.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Workflow Visualization */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>Task Workflow</span>
            </h3>
            <div className="bg-muted/30 rounded-lg p-6 border border-border">
              <div className="flex flex-col gap-3">
                {WORKFLOW_STEPS.map((step, index) => {
                  const canTransitionFrom = roleInfo.transitions[step.status as keyof typeof roleInfo.transitions];
                  const isAccessible = canTransitionFrom && canTransitionFrom.length > 0;

                  return (
                    <div key={step.status}>
                      <div className={`flex items-center gap-3 p-3 rounded-lg border-2 ${
                        isAccessible
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-muted/50 opacity-60'
                      }`}>
                        <div className={`w-3 h-3 rounded-full ${step.color}`} />
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{step.label}</div>
                          <div className="text-xs text-muted-foreground">{step.description}</div>
                        </div>
                        {isAccessible ? (
                          <Badge variant="outline" className="text-xs">
                            {canTransitionFrom.length} move{canTransitionFrom.length !== 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs opacity-50">
                            No access
                          </Badge>
                        )}
                      </div>
                      {index < WORKFLOW_STEPS.length - 1 && (
                        <div className="flex justify-center py-1">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-foreground">
                  <strong>Your Workflow:</strong> {roleInfo.workflow}
                </p>
              </div>
            </div>
          </div>

          {/* Permissions */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* What You Can Do */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                What You Can Do
              </h3>
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-2">
                {roleInfo.canDo.map((item, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* What You Cannot Do */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                Limitations
              </h3>
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 space-y-2">
                {roleInfo.cannotDo.map((item, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Status Transitions Detail */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Available Status Transitions</h3>
            <div className="bg-muted/30 rounded-lg p-4 border border-border space-y-3">
              {Object.entries(roleInfo.transitions).map(([from, toList]) => {
                const fromStep = WORKFLOW_STEPS.find(s => s.status === from);
                if (!toList || toList.length === 0) return null;

                return (
                  <div key={from} className="flex items-start gap-3 p-3 bg-background rounded border border-border">
                    <div className="flex-shrink-0">
                      <Badge variant="outline" className="font-mono text-xs">
                        {fromStep?.label}
                      </Badge>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex flex-wrap gap-2">
                      {toList.map((to) => {
                        const toStep = WORKFLOW_STEPS.find(s => s.status === to);
                        return (
                          <Badge key={to} variant="secondary" className="text-xs">
                            {toStep?.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Help Note */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <p className="text-sm text-foreground">
              <strong>Need Help?</strong> If you try to move a task to an invalid status, you'll see a detailed
              message explaining why the transition isn't allowed and what your valid options are.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
