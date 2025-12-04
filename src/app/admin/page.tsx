"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface OverviewStats {
  totalUsers: number;
  newUsersInPeriod: number;
  totalMessages: number;
  messagesInPeriod: number;
  totalCostUsd: number;
  costInPeriod: number;
  avgMessagesPerUser: number;
  costPerUser: number;
  ragDocuments: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/admin/analytics?type=overview&range=30d");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-red-600 bg-red-50 p-4 rounded-lg">
        Error: {error || "Failed to load stats"}
      </div>
    );
  }

  const kpiCards = [
    {
      title: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      subtitle: `+${stats.newUsersInPeriod} this month`,
      icon: "👥",
    },
    {
      title: "Total Messages",
      value: stats.totalMessages.toLocaleString(),
      subtitle: `${stats.messagesInPeriod.toLocaleString()} this month`,
      icon: "💬",
    },
    {
      title: "AI Costs",
      value: `$${stats.totalCostUsd.toFixed(2)}`,
      subtitle: `$${stats.costInPeriod.toFixed(2)} this month`,
      icon: "💰",
    },
    {
      title: "Avg Messages/User",
      value: stats.avgMessagesPerUser.toFixed(1),
      subtitle: `$${stats.costPerUser.toFixed(4)} per user`,
      icon: "📊",
    },
    {
      title: "RAG Documents",
      value: stats.ragDocuments.toLocaleString(),
      subtitle: "Knowledge base",
      icon: "📚",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600">Overview of your Anthon instance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {kpiCards.map((card) => (
          <Card key={card.title} className="bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                {card.title}
              </CardTitle>
              <span className="text-2xl">{card.icon}</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {card.value}
              </div>
              <p className="text-xs text-slate-500 mt-1">{card.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <a
                href="/admin/users"
                className="p-4 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <span className="text-2xl block mb-2">👥</span>
                <span className="font-medium">Manage Users</span>
              </a>
              <a
                href="/admin/rag"
                className="p-4 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <span className="text-2xl block mb-2">📚</span>
                <span className="font-medium">Upload RAG Docs</span>
              </a>
              <a
                href="/admin/analytics"
                className="p-4 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <span className="text-2xl block mb-2">📈</span>
                <span className="font-medium">View Analytics</span>
              </a>
              <a
                href="/chat"
                className="p-4 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <span className="text-2xl block mb-2">💬</span>
                <span className="font-medium">Open Chat</span>
              </a>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Database</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  ● Connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">OpenRouter API</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  ● Active
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Clerk Auth</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  ● Active
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Vercel Blob</span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  ○ Optional
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
