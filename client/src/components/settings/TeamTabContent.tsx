import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  UserPlus,
  CheckCircle,
  Search,
  MoreVertical,
  Shield,
  ShieldCheck,
  Edit,
  Crown,
  Key,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@shared/schema";

export function TeamTabContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "" as "SuperAdmin" | "WarehouseManager" | "Editor" | "Auditor",
    newPassword: "",
  });
  const [selectedRole, setSelectedRole] = useState<"SuperAdmin" | "WarehouseManager" | "Editor" | "Auditor">("Editor");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [userToActivate, setUserToActivate] = useState<User | null>(null);

  // Fetch all users from API
  const { data: teamMembers = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!user && user.role === "SuperAdmin",
    queryFn: async () => {
      const response = await fetch("/api/users", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      return response.json();
    }
  });

  // Mutation to update user
  const updateUserMutation = useMutation({
    mutationFn: async (data: { userId: string; updates: Partial<User> }) => {
      const response = await fetch(`/api/users/${data.userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data.updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update user");
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditDialogOpen(false);
      setRoleDialogOpen(false);

      // Show specific message for account activation
      if (variables.updates.accountStatus === "active") {
        toast({
          title: "User Activated",
          description: "The user account has been approved and activated successfully",
        });
      } else {
        toast({
          title: "User Updated",
          description: "User information has been updated successfully",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler to open edit dialog
  const handleEditUser = (member: User) => {
    setSelectedUser(member);
    setEditForm({
      email: member.email,
      firstName: member.firstName || "",
      lastName: member.lastName || "",
      role: member.role as "SuperAdmin" | "WarehouseManager" | "Editor" | "Auditor",
      newPassword: "",
    });
    setShowPasswordReset(false);
    setEditDialogOpen(true);
  };

  // Handler to submit edit form
  const handleSaveEdit = () => {
    if (!selectedUser) return;

    // Only include password if it's set
    const updates: any = {
      email: editForm.email,
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      role: editForm.role,
    };

    if (editForm.newPassword) {
      updates.password = editForm.newPassword;
    }

    updateUserMutation.mutate({
      userId: selectedUser.id,
      updates,
    });
  };

  // Handler to activate pending user
  const handleActivateUser = (member: User) => {
    setUserToActivate(member);
    setActivateDialogOpen(true);
  };

  // Confirm and activate user
  const confirmActivateUser = () => {
    if (!userToActivate) return;

    updateUserMutation.mutate({
      userId: userToActivate.id,
      updates: {
        accountStatus: "active",
      },
    });

    setActivateDialogOpen(false);
    setUserToActivate(null);
  };

  // Handler to open role change dialog (quick action)
  const handleChangeRole = (member: User) => {
    setSelectedUser(member);
    setSelectedRole(member.role as "SuperAdmin" | "WarehouseManager" | "Editor" | "Auditor");
    setRoleDialogOpen(true);
  };

  // Handler to submit role change
  const handleSaveRole = () => {
    if (!selectedUser) return;

    updateUserMutation.mutate({
      userId: selectedUser.id,
      updates: { role: selectedRole },
    });
  };

  const filteredMembers = teamMembers.filter(member =>
    member.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (member.firstName && member.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (member.lastName && member.lastName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getInitials = (member: User) => {
    if (member.firstName && member.lastName) {
      return (member.firstName[0] + member.lastName[0]).toUpperCase();
    }
    return member.username.slice(0, 2).toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "SuperAdmin":
        return { variant: "default" as const, icon: Crown, color: "text-primary" };
      case "WarehouseManager":
        return { variant: "secondary" as const, icon: ShieldCheck, color: "text-blue-600" };
      case "Editor":
        return { variant: "secondary" as const, icon: Edit, color: "text-green-600" };
      case "Auditor":
        return { variant: "outline" as const, icon: Shield, color: "text-orange-600" };
      default:
        return { variant: "secondary" as const, icon: Users, color: "text-gray-600" };
    }
  };

  const getMembersByRole = () => {
    const membersByRole: Record<string, User[]> = {};
    filteredMembers.forEach(member => {
      if (!membersByRole[member.role]) {
        membersByRole[member.role] = [];
      }
      membersByRole[member.role].push(member);
    });
    return membersByRole;
  };

  const membersByRole = getMembersByRole();
  const roles = ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"];

  return (
    <>
      <div className="space-y-6">
        {/* Header with Add User Button */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Team Management</h3>
            <p className="text-sm text-muted-foreground">
              Manage team members, roles, and permissions across the organization
            </p>
          </div>
          {user?.role === "SuperAdmin" && (
            <Button data-testid="button-add-user">
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          )}
        </div>

        {/* Search and Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Search Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or username..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-team"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <Users className="mr-2 h-4 w-4" />
                Total Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-members">
                {filteredMembers.length}
              </div>
              <p className="text-sm text-muted-foreground">Active users</p>
            </CardContent>
          </Card>
        </div>

        {/* Team Members */}
        {isLoading ? (
          <div className="space-y-6">
            {roles.map(role => (
              <Card key={role}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredMembers.length === 0 ? (
          <Card>
            <CardHeader className="text-center py-16">
              <Users className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
              <CardTitle className="text-muted-foreground">No Team Members Found</CardTitle>
              <p className="text-muted-foreground">
                {searchTerm
                  ? "No team members match your search criteria."
                  : "No team members have been added yet. Add users to get started."
                }
              </p>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-6">
            {roles.map(role => {
              const roleMembers = membersByRole[role] || [];
              if (roleMembers.length === 0) return null;

              const roleBadge = getRoleBadge(role);
              const RoleIcon = roleBadge.icon;

              return (
                <Card key={role}>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <RoleIcon className={`mr-2 h-5 w-5 ${roleBadge.color}`} />
                      {role === "SuperAdmin" ? "Super Admin" : role}
                      <Badge variant="secondary" className="ml-3">
                        {roleMembers.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {roleMembers.map(member => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                                {getInitials(member)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-foreground">
                                  {member.firstName && member.lastName
                                    ? `${member.firstName} ${member.lastName}`
                                    : member.username
                                  }
                                </p>
                                {member.accountStatus === "pending" && (
                                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                                    Pending Approval
                                  </Badge>
                                )}
                                {member.accountStatus === "suspended" && (
                                  <Badge variant="outline" className="text-gray-600 border-gray-600">
                                    Suspended
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                <span className="font-mono">@{member.username}</span> - {member.email}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Joined {new Date(member.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          {user?.role === "SuperAdmin" && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {member.accountStatus === "pending" && (
                                  <DropdownMenuItem
                                    onClick={() => handleActivateUser(member)}
                                    className="text-green-600"
                                  >
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Approve & Activate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleEditUser(member)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit User
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleChangeRole(member)}>
                                  <Shield className="mr-2 h-4 w-4" />
                                  Change Role
                                </DropdownMenuItem>
                                {member.accountStatus === "active" && (
                                  <DropdownMenuItem className="text-destructive">
                                    <Users className="mr-2 h-4 w-4" />
                                    Deactivate
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and role. Changes will take effect immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username (Login ID)</Label>
              <Input
                id="username"
                value={selectedUser?.username || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                Users log in with this username + password
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  placeholder="John"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditForm({ ...editForm, role: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SuperAdmin">Super Admin</SelectItem>
                  <SelectItem value="WarehouseManager">Warehouse Manager</SelectItem>
                  <SelectItem value="Editor">Editor</SelectItem>
                  <SelectItem value="Auditor">Auditor</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {selectedUser && selectedUser.username === user?.username && (
                  <span className="text-destructive">Warning: You are editing your own account</span>
                )}
              </p>
            </div>

            {/* Password Reset Section */}
            <div className="border-t pt-4 mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPasswordReset(!showPasswordReset)}
                className="w-full justify-between"
              >
                <div className="flex items-center">
                  <Key className="mr-2 h-4 w-4" />
                  Reset Password
                </div>
                {showPasswordReset ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>

              {showPasswordReset && (
                <div className="grid gap-2 mt-4">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                    placeholder="Enter new password"
                  />
                  <p className="text-sm text-muted-foreground">
                    Leave blank to keep current password. Minimum 6 characters.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={updateUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog (Quick Action) */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Quickly update the role for {selectedUser?.firstName && selectedUser?.lastName
                ? `${selectedUser.firstName} ${selectedUser.lastName}`
                : selectedUser?.username || "this user"}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="quick-role">New Role</Label>
              <Select
                value={selectedRole}
                onValueChange={(value) => setSelectedRole(value as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SuperAdmin">
                    <div className="flex items-center">
                      <Crown className="mr-2 h-4 w-4 text-primary" />
                      Super Admin
                    </div>
                  </SelectItem>
                  <SelectItem value="WarehouseManager">
                    <div className="flex items-center">
                      <ShieldCheck className="mr-2 h-4 w-4 text-blue-600" />
                      Warehouse Manager
                    </div>
                  </SelectItem>
                  <SelectItem value="Editor">
                    <div className="flex items-center">
                      <Edit className="mr-2 h-4 w-4 text-green-600" />
                      Editor
                    </div>
                  </SelectItem>
                  <SelectItem value="Auditor">
                    <div className="flex items-center">
                      <Shield className="mr-2 h-4 w-4 text-orange-600" />
                      Auditor
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Current role: <strong>{selectedUser?.role}</strong>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleDialogOpen(false)}
              disabled={updateUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRole}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? "Updating..." : "Update Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate User Confirmation Dialog */}
      <Dialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Approve & Activate User</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve and activate this user account?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">User Details:</p>
              <p className="text-sm">
                <strong>Name:</strong>{" "}
                {userToActivate?.firstName && userToActivate?.lastName
                  ? `${userToActivate.firstName} ${userToActivate.lastName}`
                  : userToActivate?.username}
              </p>
              <p className="text-sm">
                <strong>Email:</strong> {userToActivate?.email}
              </p>
              <p className="text-sm">
                <strong>Username:</strong> @{userToActivate?.username}
              </p>
              <p className="text-sm">
                <strong>Role:</strong> {userToActivate?.role}
              </p>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Once activated, the user will be able to log in immediately.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActivateDialogOpen(false)}
              disabled={updateUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmActivateUser}
              disabled={updateUserMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {updateUserMutation.isPending ? "Activating..." : "Approve & Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
