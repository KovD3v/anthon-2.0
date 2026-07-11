import { BarChart3, FileText, MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AnimatedPageHeader } from "@/components/ui/animated-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  KPIStatsSkeleton,
  SystemStatusSkeleton,
} from "../../(chat)/components/Skeletons";
import { KPIStats } from "../components/KPIStats";
import { SystemStatus } from "../components/SystemStatus";

export default function AdminDashboard() {
  return (
    <div className="space-y-8">
      <AnimatedPageHeader
        title="Dashboard"
        description="Panoramica operativa della tua istanza Anthon"
      />

      <Suspense fallback={<KPIStatsSkeleton />}>
        <KPIStats />
      </Suspense>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Azioni rapide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Link
                href="/admin/users"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:bg-muted/50"
              >
                <Users className="h-8 w-8 text-primary" />
                <span className="font-medium">Gestisci utenti</span>
              </Link>
              <Link
                href="/admin/rag"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:bg-muted/50"
              >
                <FileText className="h-8 w-8 text-primary" />
                <span className="font-medium">Carica documenti</span>
              </Link>
              <Link
                href="/admin/analytics"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:bg-muted/50"
              >
                <BarChart3 className="h-8 w-8 text-primary" />
                <span className="font-medium">Vedi analisi</span>
              </Link>
              <Link
                href="/chat"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:bg-muted/50"
              >
                <MessageSquare className="h-8 w-8 text-primary" />
                <span className="font-medium">Apri chat</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background/60 backdrop-blur-xl border-white/10 shadow-xl">
          <CardHeader>
            <CardTitle>Stato dei sistemi</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<SystemStatusSkeleton />}>
              <SystemStatus />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
