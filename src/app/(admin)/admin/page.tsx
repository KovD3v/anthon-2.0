"use client";

import {
  Activity,
  BarChart3,
  Database,
  DollarSign,
  FileText,
  Key,
  MessageSquare,
  Users,
} from "lucide-react";
import Link from "next/link";
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

interface HealthStatus {
  status: "connected" | "error";
  message?: string;
}

interface HealthResponse {
  database: HealthStatus;
  openrouter: HealthStatus;
  clerk: HealthStatus;
  vercelBlob: HealthStatus;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, healthRes] = await Promise.all([
          fetch("/api/admin/analytics?type=overview&range=30d"),
          fetch("/api/health"),
        ]);

        if (!statsRes.ok) throw new Error("Failed to fetch stats");
        const statsData = await statsRes.json();
        setStats(statsData);

        if (!healthRes.ok) throw new Error("Failed to fetch health");
        const healthData = await healthRes.json();
        setHealth(healthData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !stats || !health) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        Error: {error || "Failed to load data"}
      </div>
    );
  }

  const kpiCards = [
    {
      title: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      subtitle: `+${stats.newUsersInPeriod} this month`,
      icon: Users,
    },
    {
      title: "Total Messages",
      value: stats.totalMessages.toLocaleString(),
      subtitle: `${stats.messagesInPeriod.toLocaleString()} this month`,
      icon: MessageSquare,
    },
    {
      title: "AI Costs",
      value: `$${stats.totalCostUsd.toFixed(2)}`,
      subtitle: `$${stats.costInPeriod.toFixed(2)} this month`,
      icon: DollarSign,
    },
    {
      title: "Avg Messages/User",
      value: stats.avgMessagesPerUser.toFixed(1),
      subtitle: `$${stats.costPerUser.toFixed(4)} per user`,
      icon: BarChart3,
    },
    {
      title: "RAG Documents",
      value: stats.ragDocuments.toLocaleString(),
      subtitle: "Knowledge base",
      icon: FileText,
    },
  ];

  const systemServices = [
    {
      key: "database" as keyof HealthResponse,
      name: "Database",
      icon: Database,
    },
    {
      key: "openrouter" as keyof HealthResponse,
      name: "OpenRouter API",
      icon: Activity,
    },
    {
      key: "clerk" as keyof HealthResponse,
      name: "Clerk Auth",
      icon: Key,
    },
    {
      key: "vercelBlob" as keyof HealthResponse,
      name: "Vercel Blob",
      icon: FileText,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your Anthon instance
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpiCards.map((card) => (
          <Card
            key={card.title}
            className="bg-background/60 backdrop-blur-xl border-white/10 shadow-xl"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.subtitle}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="bg-background/60 backdrop-blur-xl border-white/10 shadow-xl">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Link
                href="/admin/users"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-6 text-card-foreground transition-colors hover:bg-muted/50"
              >
                <Users className="h-8 w-8 text-primary" />
                <span className="font-medium">Manage Users</span>
              </Link>
              <Link
                href="/admin/rag"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-6 text-card-foreground transition-colors hover:bg-muted/50"
              >
                <FileText className="h-8 w-8 text-primary" />
                <span className="font-medium">Upload RAG Docs</span>
              </Link>
              <Link
                href="/admin/analytics"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-6 text-card-foreground transition-colors hover:bg-muted/50"
              >
                <BarChart3 className="h-8 w-8 text-primary" />
                <span className="font-medium">View Analytics</span>
              </Link>
              <Link
                href="/chat"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-6 text-card-foreground transition-colors hover:bg-muted/50"
              >
                <MessageSquare className="h-8 w-8 text-primary" />
                <span className="font-medium">Open Chat</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background/60 backdrop-blur-xl border-white/10 shadow-xl">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {systemServices.map((service) => {
                const serviceHealth = health[service.key];
                const isConnected = serviceHealth.status === "connected";
                return (
                  <div
                    key={service.key}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <service.icon className="h-4 w-4 text-muted-foreground" />
                      {service.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          isConnected
                            ? "bg-green-500/10 text-green-500"
                            : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {isConnected ? "● Connected" : "● Error"}
                      </span>
                      {!isConnected && serviceHealth.message && (
                        <span
                          className="text-xs text-muted-foreground max-w-48 truncate"
                          title={serviceHealth.message}
                        >
                          {serviceHealth.message}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
