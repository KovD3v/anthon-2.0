import {
  BarChart3,
  DollarSign,
  FileText,
  MessageSquare,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOverviewStats, getStartDate } from "@/lib/admin";

export async function KPIStats() {
  const startDate = getStartDate("30d");
  const stats = await getOverviewStats(startDate);

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

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {kpiCards.map((card) => (
        <Card
          key={card.title}
          variant="glass"
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
  );
}
