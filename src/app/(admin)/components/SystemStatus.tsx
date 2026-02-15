import { Activity, Database, FileText, Key } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSystemHealth } from "@/lib/admin";

export async function SystemStatus() {
  const health = await getSystemHealth();

  const systemServices = [
    {
      key: "database" as const,
      name: "Database",
      icon: Database,
    },
    {
      key: "openrouter" as const,
      name: "OpenRouter API",
      icon: Activity,
    },
    {
      key: "clerk" as const,
      name: "Clerk Auth",
      icon: Key,
    },
    {
      key: "vercelBlob" as const,
      name: "Vercel Blob",
      icon: FileText,
    },
  ];

  return (
    <div className="space-y-4">
      {systemServices.map((service) => {
        const serviceHealth = health[service.key];
        const isConnected = serviceHealth.status === "connected";
        return (
          <div key={service.key} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <service.icon className="h-4 w-4 text-muted-foreground" />
              {service.name}
            </span>
            <div className="flex items-center gap-2">
              <Badge variant={isConnected ? "success" : "error"}>
                {isConnected ? "● Connected" : "● Error"}
              </Badge>
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
  );
}
