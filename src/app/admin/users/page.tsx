"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/generated/prisma";

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
      } else {
        const error = await res.json();
        alert(error.error || "Failed to update role");
      }
    } catch (error) {
      console.error("Failed to update role:", error);
    } finally {
      setUpdatingRole(null);
    }
  }

  return (
    <div className="flex gap-8">
      {/* Users List */}
      <div className="flex-1">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-600">Manage users and view their activity</p>
        </div>

        {/* Filters */}
        <Card className="bg-white mb-6">
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
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as UserRole | "");
                  setPage(1);
                }}
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <Card className="bg-white">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">
                        User
                      </th>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">
                        Role
                      </th>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">
                        Messages
                      </th>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">
                        Status
                      </th>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-600">
                        Joined
                      </th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className={`hover:bg-slate-50 cursor-pointer ${
                          selectedUser?.user.id === user.id ? "bg-blue-50" : ""
                        }`}
                        onClick={() => fetchUserDetail(user.id)}
                      >
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-medium text-slate-900">
                              {user.name || "No name"}
                            </div>
                            <div className="text-sm text-slate-500">
                              {user.email}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <RoleBadge role={user.role} />
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {user.messageCount}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={user.subscriptionStatus} />
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {new Date(user.createdAt).toLocaleDateString("it-IT")}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-slate-400">→</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <div className="text-sm text-slate-600">
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
          <Card className="bg-white sticky top-8">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>User Details</CardTitle>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div>
                    <h4 className="font-medium mb-2">Profile</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Email</span>
                        <span>{selectedUser.user.email || "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Name</span>
                        <span>{selectedUser.user.profile?.name || "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Sport</span>
                        <span>{selectedUser.user.profile?.sport || "-"}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Role</span>
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
                            className="px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <h4 className="font-medium mb-2">Statistics</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-slate-50 p-2 rounded">
                        <div className="text-slate-500">Messages</div>
                        <div className="font-medium">
                          {selectedUser.stats.totalMessages}
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded">
                        <div className="text-slate-500">Cost</div>
                        <div className="font-medium">
                          ${selectedUser.stats.totalCostUsd.toFixed(4)}
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded">
                        <div className="text-slate-500">Output Tokens</div>
                        <div className="font-medium">
                          {selectedUser.stats.totalOutputTokens.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded">
                        <div className="text-slate-500">Avg Gen Time</div>
                        <div className="font-medium">
                          {selectedUser.stats.avgGenerationTimeMs.toFixed(0)}ms
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Chats */}
                  <div>
                    <h4 className="font-medium mb-2">
                      Recent Conversations ({selectedUser.channels.length})
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedUser.channels.slice(0, 5).map((channel) => (
                        <div
                          key={channel.channelId}
                          className="border rounded p-2 text-sm"
                        >
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>{channel.messageCount} messages</span>
                            <span>
                              {new Date(
                                channel.lastMessageAt
                              ).toLocaleDateString("it-IT")}
                            </span>
                          </div>
                          <div className="text-slate-600 truncate">
                            {channel.messages[
                              channel.messages.length - 1
                            ]?.content?.slice(0, 100) || "No content"}
                          </div>
                        </div>
                      ))}
                      {selectedUser.channels.length === 0 && (
                        <div className="text-slate-400 text-sm">
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
    USER: "bg-slate-100 text-slate-800",
    ADMIN: "bg-blue-100 text-blue-800",
    SUPER_ADMIN: "bg-purple-100 text-purple-800",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors[role]}`}
    >
      {role.replace("_", " ")}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        Free
      </span>
    );
  }

  const colors: Record<string, string> = {
    TRIAL: "bg-yellow-100 text-yellow-800",
    ACTIVE: "bg-green-100 text-green-800",
    CANCELED: "bg-red-100 text-red-800",
    EXPIRED: "bg-slate-100 text-slate-600",
    PAST_DUE: "bg-orange-100 text-orange-800",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
        colors[status] || colors.EXPIRED
      }`}
    >
      {status}
    </span>
  );
}
