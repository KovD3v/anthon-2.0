"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import type { UserRole } from "@/generated/prisma";
import { toast } from "sonner";

interface User {
  id: string;
  email: string | null;
  role: UserRole;
  name: string | null;
  sport: string | null;
  subscriptionStatus: string | null;
  planName: string | null;
  messageCount: number;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UserDetail {
  user: {
    id: string;
    email: string | null;
    role: UserRole;
    createdAt: string;
    profile: { name: string | null; sport: string | null } | null;
    preferences: { tone: string | null; language: string | null } | null;
    subscription: { status: string; planName: string | null } | null;
  };
  stats: {
    totalMessages: number;
    totalCostUsd: number;
    totalOutputTokens: number;
    totalReasoningTokens: number;
    avgGenerationTimeMs: number;
  };
  channels: Array<{
    channelId: string;
    messageCount: number;
    lastMessageAt: string;
    messages: Array<{
      id: string;
      role: string;
      content: string | null;
      model: string | null;
      costUsd: number | null;
      createdAt: string;
    }>;
  }>;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Check if current user is super admin
  useEffect(() => {
    async function checkRole() {
      try {
        const res = await fetch("/api/admin/analytics?type=overview");
        // If we can access admin, check role from profile
        if (res.ok) {
          // For now, assume super admin access - in production, check actual role
          setIsSuperAdmin(true);
        }
      } catch {
        setIsSuperAdmin(false);
      }
    }
    checkRole();
  }, []);

  async function fetchUserDetail(userId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedUser(data);
      }
    } catch (error) {
      console.error("Failed to fetch user detail:", error);
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateUserRole(userId: string, newRole: UserRole) {
    setUpdatingRole(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (res.ok) {
        // Refresh users list
        fetchUsers();
        // Update detail view if open
        if (selectedUser?.user.id === userId) {
          setSelectedUser({
            ...selectedUser,
            user: { ...selectedUser.user, role: newRole },
          });
        }
        toast.success("Role updated successfully");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to update role");
      }
    } catch (error) {
      console.error("Failed to update role:", error);
      toast.error("Failed to update role");
    } finally {
      setUpdatingRole(null);
    }
  }

  return (
    <div className="flex gap-8">
      {/* Users List */}
      <div className="flex-1 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage users and view their activity
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Search by email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as UserRole | "");
                  setPage(1);
                }}
                className="rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">All Roles</option>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b">
                    <tr>
                      <th className="px-6 py-3 font-medium">User</th>
                      <th className="px-6 py-3 font-medium">Role</th>
                      <th className="px-6 py-3 font-medium">Messages</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Joined</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y border-b">
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                          selectedUser?.user.id === user.id ? "bg-muted" : ""
                        }`}
                        onClick={() => fetchUserDetail(user.id)}
                      >
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-medium text-foreground">
                              {user.name || "No name"}
                            </div>
                            <div className="text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <RoleBadge role={user.role} />
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {user.messageCount}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={user.subscriptionStatus} />
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString("it-IT")}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-muted-foreground/50">→</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total
                  )}{" "}
                  of {pagination.total}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Detail Panel */}
      {selectedUser && (
        <div className="w-96 shrink-0">
          <Card className="sticky top-8">
            <CardHeader className="border-b space-y-0 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle>User Details</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSelectedUser(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div>
                    <h4 className="font-medium mb-2">Profile</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-1 border-b border-border/50 last:border-0">
                        <span className="text-muted-foreground">Email</span>
                        <span className="font-medium">
                          {selectedUser.user.email || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50 last:border-0">
                        <span className="text-muted-foreground">Name</span>
                        <span className="font-medium">
                          {selectedUser.user.profile?.name || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50 last:border-0">
                        <span className="text-muted-foreground">Sport</span>
                        <span className="font-medium">
                          {selectedUser.user.profile?.sport || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-muted-foreground">Role</span>
                        {isSuperAdmin ? (
                          <select
                            value={selectedUser.user.role}
                            onChange={(e) =>
                              updateUserRole(
                                selectedUser.user.id,
                                e.target.value as UserRole
                              )
                            }
                            disabled={updatingRole === selectedUser.user.id}
                            className="rounded border bg-background px-2 py-1 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                          >
                            <option value="USER">User</option>
                            <option value="ADMIN">Admin</option>
                            <option value="SUPER_ADMIN">Super Admin</option>
                          </select>
                        ) : (
                          <RoleBadge role={selectedUser.user.role} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div>
                    <h4 className="font-medium mb-3">Statistics</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-muted/50 p-2.5 rounded-lg border">
                        <div className="text-xs text-muted-foreground mb-1">
                          Messages
                        </div>
                        <div className="font-semibold">
                          {selectedUser.stats.totalMessages}
                        </div>
                      </div>
                      <div className="bg-muted/50 p-2.5 rounded-lg border">
                        <div className="text-xs text-muted-foreground mb-1">
                          Cost
                        </div>
                        <div className="font-semibold">
                          ${selectedUser.stats.totalCostUsd.toFixed(4)}
                        </div>
                      </div>
                      <div className="bg-muted/50 p-2.5 rounded-lg border">
                        <div className="text-xs text-muted-foreground mb-1">
                          Output Tokens
                        </div>
                        <div className="font-semibold">
                          {selectedUser.stats.totalOutputTokens.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-muted/50 p-2.5 rounded-lg border">
                        <div className="text-xs text-muted-foreground mb-1">
                          Avg Gen Time
                        </div>
                        <div className="font-semibold">
                          {selectedUser.stats.avgGenerationTimeMs.toFixed(0)}
                          ms
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Chats */}
                  <div>
                    <h4 className="font-medium mb-3">
                      Recent Conversations ({selectedUser.channels.length})
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {selectedUser.channels.slice(0, 5).map((channel) => (
                        <div
                          key={channel.channelId}
                          className="rounded-lg border bg-card p-3 text-sm hover:shadow-sm transition-shadow"
                        >
                          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                            <span className="font-medium text-primary">
                              {channel.messageCount} messages
                            </span>
                            <span>
                              {new Date(
                                channel.lastMessageAt
                              ).toLocaleDateString("it-IT")}
                            </span>
                          </div>
                          <div className="text-muted-foreground/90 line-clamp-2">
                            {channel.messages[
                              channel.messages.length - 1
                            ]?.content?.slice(0, 100) || "No content"}
                          </div>
                        </div>
                      ))}
                      {selectedUser.channels.length === 0 && (
                        <div className="text-muted-foreground text-sm text-center py-4 border rounded-lg border-dashed">
                          No conversations yet
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const colors = {
    USER: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ADMIN:
      "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    SUPER_ADMIN:
      "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  };

  const baseStyles =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

  return (
    <span className={`${baseStyles} ${colors[role]} border-transparent`}>
      {role.replace("_", " ")}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const baseStyles =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

  if (!status) {
    return (
      <span
        className={`${baseStyles} bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent`}
      >
        Free
      </span>
    );
  }

  const colors: Record<string, string> = {
    TRIAL:
      "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-transparent",
    ACTIVE:
      "bg-green-500/10 text-green-700 dark:text-green-400 border-transparent",
    CANCELED: "bg-destructive/10 text-destructive border-transparent",
    EXPIRED: "bg-secondary text-secondary-foreground border-transparent",
    PAST_DUE:
      "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-transparent",
  };

  return (
    <span className={`${baseStyles} ${colors[status] || colors.EXPIRED}`}>
      {status}
    </span>
  );
}
