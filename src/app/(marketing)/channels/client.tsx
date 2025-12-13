"use client";

import {
  ArrowLeft,
  Globe,
  Home,
  Link2,
  Loader2,
  MessageCircle,
  Send,
  Unlink,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useConfirm } from "@/hooks/use-confirm";

// Channel icons and labels
const channelConfig = {
  WEB: {
    icon: Globe,
    label: "Web",
    description: "Chatta direttamente dal sito web",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    canDisconnect: false, // Web is tied to the account
  },
  WHATSAPP: {
    icon: MessageCircle,
    label: "WhatsApp",
    description: "Collegato tramite WhatsApp",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    canDisconnect: true,
  },
  TELEGRAM: {
    icon: Send,
    label: "Telegram",
    description: "Collegato tramite Telegram",
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/20",
    canDisconnect: true,
  },
} as const;

type ChannelType = keyof typeof channelConfig;

interface ChannelIdentity {
  id: string;
  channel: string;
  externalId: string;
  createdAt: string;
}

interface LinkToken {
  id: string;
  channel: string;
  expiresAt: string;
  consumedAt: string | null;
}

interface ChannelsPageClientProps {
  connectedChannels: ChannelIdentity[];
  linkTokens: LinkToken[];
  userCreatedAt?: string;
}

function ChannelIcon({
  channel,
  className,
}: {
  channel: ChannelType;
  className?: string;
}) {
  const config = channelConfig[channel];
  const Icon = config?.icon || Globe;
  return <Icon className={className} />;
}

function StatusBadge({
  status,
}: {
  status: "connected" | "pending" | "expired";
}) {
  const styles = {
    connected: "bg-green-500/10 text-green-500 border-green-500/20",
    pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    expired: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  const labels = {
    connected: "Collegato",
    pending: "In attesa",
    expired: "Scaduto",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export function ChannelsPageClient({
  connectedChannels: initialChannels,
  linkTokens,
  userCreatedAt,
}: ChannelsPageClientProps) {
  const [connectedChannels, setConnectedChannels] =
    useState<ChannelIdentity[]>(initialChannels);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

  // Group connected channels by type
  const connectedByChannel = connectedChannels.reduce(
    (acc, identity) => {
      if (!acc[identity.channel]) {
        acc[identity.channel] = [];
      }
      acc[identity.channel].push(identity);
      return acc;
    },
    {} as Record<string, ChannelIdentity[]>,
  );

  // Define all available channels
  const allChannels: ChannelType[] = ["WEB", "TELEGRAM", "WHATSAPP"];

  const handleDisconnect = async (identity: ChannelIdentity) => {
    const config = channelConfig[identity.channel as ChannelType];

    const confirmed = await confirm({
      title: `Scollegare ${config?.label || identity.channel}?`,
      description:
        "Questa azione scollega il tuo account da questo canale. Potrai ricollegarlo in qualsiasi momento.",
      confirmText: "Scollega",
      cancelText: "Annulla",
      variant: "destructive",
    });

    if (!confirmed) return;

    setDisconnecting(identity.id);

    try {
      const response = await fetch(`/api/channels/${identity.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setConnectedChannels((prev) =>
          prev.filter((c) => c.id !== identity.id),
        );
        toast.success(
          `${config?.label || identity.channel} scollegato con successo`,
        );
      } else {
        const error = await response.json();
        toast.error(error.error || "Impossibile scollegare il canale");
      }
    } catch (error) {
      console.error("Failed to disconnect:", error);
      toast.error("Impossibile scollegare il canale");
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Confirm Dialog */}
      {isOpen && options && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">{options.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {options.description}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsOpen(false)}>
                {options.cancelText}
              </Button>
              <Button
                variant={
                  options.variant === "destructive" ? "destructive" : "default"
                }
                onClick={() => handleConfirm()}
              >
                {options.confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Torna indietro
              </Button>
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <Home className="h-4 w-4" />
                Home
              </Button>
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium">Canali</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Canali Collegati
          </h1>
          <p className="mt-2 text-muted-foreground">
            Gestisci i canali di comunicazione collegati al tuo account.
          </p>
        </div>

        {/* Channel Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {allChannels.map((channelType) => {
            const config = channelConfig[channelType];
            let connected = connectedByChannel[channelType] || [];

            // Web is always connected
            if (channelType === "WEB" && connected.length === 0) {
              connected = [
                {
                  id: "web-internal",
                  channel: "WEB",
                  externalId: "Web",
                  createdAt: userCreatedAt || new Date().toISOString(),
                },
              ];
            }

            const isConnected = connected.length > 0;
            const Icon = config.icon;

            return (
              <Card
                key={channelType}
                className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg ${
                  isConnected ? config.borderColor : "border-border"
                }`}
              >
                {/* Gradient Background */}
                <div
                  className={`absolute inset-0 opacity-50 ${config.bgColor}`}
                  style={{
                    background: `radial-gradient(circle at top right, ${
                      isConnected ? "var(--tw-gradient-stops)" : "transparent"
                    }, transparent 70%)`,
                  }}
                />

                <CardHeader className="relative">
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${config.bgColor}`}
                    >
                      <Icon className={`h-6 w-6 ${config.color}`} />
                    </div>
                    {isConnected ? (
                      <StatusBadge status="connected" />
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Non collegato
                      </span>
                    )}
                  </div>
                  <CardTitle className="mt-4">{config.label}</CardTitle>
                  <CardDescription>{config.description}</CardDescription>
                </CardHeader>

                <CardContent className="relative">
                  {isConnected ? (
                    <div className="space-y-3">
                      {connected.map((identity) => (
                        <div
                          key={identity.id}
                          className="flex items-center gap-3 rounded-lg bg-muted/50 p-3"
                        >
                          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {channelType === "WEB"
                                ? "Account Web"
                                : `ID: ${identity.externalId}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Collegato il {formatDate(identity.createdAt)}
                            </p>
                          </div>
                          {config.canDisconnect && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDisconnect(identity)}
                              disabled={disconnecting === identity.id}
                            >
                              {disconnecting === identity.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Unlink className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">
                        {channelType === "TELEGRAM" && (
                          <>
                            Usa{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">
                              /connect
                            </code>{" "}
                            nel bot Telegram
                          </>
                        )}
                        {channelType === "WHATSAPP" && "Presto disponibile"}
                        {channelType === "WEB" &&
                          "Collegamento automatico al login"}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Link Activity */}
        {linkTokens.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-4">
              Attività di Collegamento Recente
            </h2>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {linkTokens.map((token) => {
                    const config = channelConfig[token.channel as ChannelType];
                    const isConsumed = !!token.consumedAt;
                    const isExpired =
                      new Date(token.expiresAt).getTime() < Date.now() &&
                      !isConsumed;
                    const status = isConsumed
                      ? "connected"
                      : isExpired
                        ? "expired"
                        : "pending";

                    return (
                      <div
                        key={token.id}
                        className="flex items-center gap-4 px-6 py-4"
                      >
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            config?.bgColor || "bg-muted"
                          }`}
                        >
                          <ChannelIcon
                            channel={token.channel as ChannelType}
                            className={`h-5 w-5 ${
                              config?.color || "text-muted-foreground"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {config?.label || token.channel}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isConsumed && token.consumedAt
                              ? `Collegato il ${formatDate(token.consumedAt)}`
                              : isExpired
                                ? `Scaduto il ${formatDate(token.expiresAt)}`
                                : `Scade il ${formatDate(token.expiresAt)}`}
                          </p>
                        </div>
                        <StatusBadge status={status} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 rounded-2xl border bg-linear-to-br from-muted/50 to-muted/30 p-6">
          <h3 className="text-lg font-semibold">
            Come collegare un nuovo canale?
          </h3>
          <div className="mt-4 space-y-4">
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-500 font-medium text-sm">
                1
              </div>
              <div>
                <p className="font-medium">Telegram</p>
                <p className="text-sm text-muted-foreground">
                  Avvia una conversazione con il bot Telegram e invia il comando{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    /connect
                  </code>
                  . Riceverai un link per collegare il tuo account.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500 font-medium text-sm">
                2
              </div>
              <div>
                <p className="font-medium">WhatsApp</p>
                <p className="text-sm text-muted-foreground">
                  Il supporto WhatsApp sarà disponibile a breve. Resta
                  sintonizzato per gli aggiornamenti.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
