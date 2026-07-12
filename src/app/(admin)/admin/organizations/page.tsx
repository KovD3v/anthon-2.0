"use client";

import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatedPageHeader } from "@/components/ui/animated-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  applyOrgOverrides,
  resolveOrgPlanDefaults,
} from "@/lib/organizations/plan-defaults";
import {
  ORGANIZATION_BASE_PLANS,
  ORGANIZATION_MODEL_TIERS,
  type OrganizationContractInput,
} from "@/lib/organizations/types";

interface OrganizationSummary {
  id: string;
  clerkOrganizationId: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  pendingOwnerEmail: string | null;
  owner: { id: string; email: string | null } | null;
  contract: (OrganizationContractInput & { version: number }) | null;
  effective?: {
    seatLimit: number;
    planLabel: string;
    modelTier: OrganizationContractInput["modelTier"];
    limits: {
      maxRequestsPerDay: number;
      maxInputTokensPerDay: number;
      maxOutputTokensPerDay: number;
      maxCostPerDay: number;
      maxContextMessages: number;
    };
  } | null;
  activeMembers: number;
  createdAt: string;
  updatedAt: string;
}

interface OrganizationDetail extends OrganizationSummary {
  memberships: Array<{
    id: string;
    role: "OWNER" | "MEMBER";
    status: "ACTIVE" | "REMOVED" | "BLOCKED";
    user: { id: string; email: string | null; clerkId: string | null };
  }>;
}

interface OrganizationAuditLog {
  id: string;
  actorType: string;
  action: string;
  createdAt: string;
  actorUser: { id: string; email: string | null } | null;
}

interface ContractFormState extends OrganizationContractInput {
  name: string;
  slug: string;
  ownerEmail: string;
}

const DEFAULT_FORM: ContractFormState = {
  name: "",
  slug: "",
  ownerEmail: "",
  basePlan: "BASIC",
  seatLimit: 10,
  planLabel: "Basic",
  modelTier: "BASIC",
  maxRequestsPerDay: 50,
  maxInputTokensPerDay: 500_000,
  maxOutputTokensPerDay: 250_000,
  maxCostPerDay: 3,
  maxContextMessages: 15,
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  ORGANIZATION_CREATED: "Organizzazione creata",
  OWNER_ASSIGNED: "Proprietario assegnato",
  OWNER_TRANSFERRED: "Proprietario trasferito",
  CONTRACT_UPDATED: "Contratto aggiornato",
  MEMBERSHIP_SYNCED: "Membro sincronizzato",
  MEMBERSHIP_BLOCKED_SEAT_LIMIT: "Membro bloccato per limite posti",
};

const ACTOR_TYPE_LABELS: Record<string, string> = {
  ADMIN: "Amministratore",
  WEBHOOK: "Sincronizzazione automatica",
};

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [selectedOrganization, setSelectedOrganization] =
    useState<OrganizationDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<OrganizationAuditLog[]>([]);
  const [form, setForm] = useState<ContractFormState>(DEFAULT_FORM);
  const [loadingList, setLoadingList] = useState(true);
  const [syncingFromClerk, setSyncingFromClerk] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const selectedId = selectedOrganization?.id ?? null;

  const fetchOrganizations = useCallback(
    async (options?: { syncFromClerk?: boolean }): Promise<boolean> => {
      setLoadingList(true);
      setListError(null);
      try {
        const params = new URLSearchParams({
          t: String(Date.now()),
        });
        if (options?.syncFromClerk) {
          params.set("sync", "1");
        }

        const res = await fetch(
          `/api/admin/organizations?${params.toString()}`,
          {
            cache: "no-store",
          },
        );
        if (!res.ok) {
          const error = (await res.json().catch(() => null)) as {
            error?: string;
            details?: { message?: string };
          } | null;
          if (res.status === 401 || res.status === 403) {
            throw new Error(error?.error || "Accesso amministratore richiesto");
          }
          throw new Error(
            error?.details?.message ||
              error?.error ||
              "Impossibile caricare le organizzazioni",
          );
        }
        const data = (await res.json()) as {
          organizations: OrganizationSummary[];
        };
        const nextOrganizations = data.organizations || [];
        setOrganizations(nextOrganizations);
        setSelectedOrganization((current) => {
          if (
            current &&
            !nextOrganizations.some(
              (organization) => organization.id === current.id,
            )
          ) {
            setAuditLogs([]);
            setIsFormOpen(false);
            return null;
          }
          return current;
        });
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Impossibile caricare le organizzazioni";
        setListError(message);
        toast.error(message);
        return false;
      } finally {
        setLoadingList(false);
      }
    },
    [],
  );

  async function handleSyncFromClerk() {
    setSyncingFromClerk(true);
    try {
      const ok = await fetchOrganizations({ syncFromClerk: true });
      if (ok) {
        toast.success("Organizzazioni sincronizzate da Clerk");
      }
    } finally {
      setSyncingFromClerk(false);
    }
  }

  async function fetchOrganizationDetail(organizationId: string) {
    setLoadingDetail(true);
    try {
      const ts = Date.now();
      const [detailRes, auditRes] = await Promise.all([
        fetch(`/api/admin/organizations/${organizationId}?t=${ts}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/organizations/${organizationId}/audit?t=${ts}`, {
          cache: "no-store",
        }),
      ]);

      if (!detailRes.ok) {
        const error = await detailRes.json();
        throw new Error(
          error.error || "Impossibile caricare i dettagli dell'organizzazione",
        );
      }

      if (!auditRes.ok) {
        const error = await auditRes.json();
        throw new Error(
          error.error || "Impossibile caricare il registro attività",
        );
      }

      const detailPayload = (await detailRes.json()) as {
        organization: OrganizationDetail;
      };
      const auditPayload = (await auditRes.json()) as {
        logs: OrganizationAuditLog[];
      };

      setSelectedOrganization(detailPayload.organization);
      setIsFormOpen(true);
      setAuditLogs(auditPayload.logs || []);

      const contract = detailPayload.organization.contract;
      setForm({
        name: detailPayload.organization.name,
        slug: detailPayload.organization.slug,
        ownerEmail:
          detailPayload.organization.owner?.email ||
          detailPayload.organization.pendingOwnerEmail ||
          "",
        basePlan: contract?.basePlan ?? DEFAULT_FORM.basePlan,
        seatLimit: contract?.seatLimit ?? DEFAULT_FORM.seatLimit,
        planLabel: contract?.planLabel ?? DEFAULT_FORM.planLabel,
        modelTier: contract?.modelTier ?? DEFAULT_FORM.modelTier,
        maxRequestsPerDay:
          contract?.maxRequestsPerDay ?? DEFAULT_FORM.maxRequestsPerDay,
        maxInputTokensPerDay:
          contract?.maxInputTokensPerDay ?? DEFAULT_FORM.maxInputTokensPerDay,
        maxOutputTokensPerDay:
          contract?.maxOutputTokensPerDay ?? DEFAULT_FORM.maxOutputTokensPerDay,
        maxCostPerDay: contract?.maxCostPerDay ?? DEFAULT_FORM.maxCostPerDay,
        maxContextMessages:
          contract?.maxContextMessages ?? DEFAULT_FORM.maxContextMessages,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossibile caricare i dettagli",
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const contractPayload: OrganizationContractInput = {
    basePlan: form.basePlan,
    seatLimit: toNumber(String(form.seatLimit), 1),
    planLabel: form.planLabel,
    modelTier: form.modelTier,
    maxRequestsPerDay: toNumber(String(form.maxRequestsPerDay), 1),
    maxInputTokensPerDay: toNumber(String(form.maxInputTokensPerDay), 1),
    maxOutputTokensPerDay: toNumber(String(form.maxOutputTokensPerDay), 1),
    maxCostPerDay: toNumber(String(form.maxCostPerDay), 0),
    maxContextMessages: toNumber(String(form.maxContextMessages), 1),
  };

  const planDefaults = resolveOrgPlanDefaults(form.basePlan);

  const effectivePreview = applyOrgOverrides(contractPayload).effective;

  function applyBasePlanDefaults() {
    const defaults = resolveOrgPlanDefaults(form.basePlan);
    setForm((current) => ({
      ...current,
      seatLimit: defaults.seatLimit,
      planLabel: defaults.planLabel,
      modelTier: defaults.modelTier,
      maxRequestsPerDay: defaults.limits.maxRequestsPerDay,
      maxInputTokensPerDay: defaults.limits.maxInputTokensPerDay,
      maxOutputTokensPerDay: defaults.limits.maxOutputTokensPerDay,
      maxCostPerDay: defaults.limits.maxCostPerDay,
      maxContextMessages: defaults.limits.maxContextMessages,
    }));
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Il nome dell'organizzazione è obbligatorio");
      return;
    }
    if (!form.ownerEmail.includes("@")) {
      toast.error("L'email del proprietario è obbligatoria");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          ownerEmail: form.ownerEmail.trim().toLowerCase(),
          contract: contractPayload,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Impossibile creare l'organizzazione");
      }

      const data = await res.json();
      toast.success("Organizzazione creata");
      await fetchOrganizations();
      if (data.organization?.id) {
        await fetchOrganizationDetail(data.organization.id);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossibile creare l'organizzazione",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!selectedId) {
      toast.error("Seleziona prima un'organizzazione");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Il nome dell'organizzazione è obbligatorio");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/organizations/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          ownerEmail: form.ownerEmail.trim().toLowerCase(),
          contract: contractPayload,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(
          error.error || "Impossibile aggiornare l'organizzazione",
        );
      }

      toast.success("Organizzazione aggiornata");
      await fetchOrganizations();
      await fetchOrganizationDetail(selectedId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossibile aggiornare l'organizzazione",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteRequest() {
    if (!selectedId) {
      toast.error("Seleziona prima un'organizzazione");
      return;
    }
    setIsDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!selectedId) {
      setIsDeleteDialogOpen(false);
      return;
    }

    setIsDeleteDialogOpen(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/organizations/${selectedId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(
          error.error || "Impossibile eliminare l'organizzazione",
        );
      }

      toast.success("Organizzazione eliminata");
      resetForm();
      await fetchOrganizations();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossibile eliminare l'organizzazione",
      );
    } finally {
      setDeleting(false);
    }
  }

  function resetForm() {
    setSelectedOrganization(null);
    setAuditLogs([]);
    setForm(DEFAULT_FORM);
    setIsFormOpen(false);
  }

  function openCreateForm() {
    setSelectedOrganization(null);
    setAuditLogs([]);
    setForm(DEFAULT_FORM);
    setIsFormOpen(true);
  }

  function openOrganizationDetail(organizationId: string) {
    setIsFormOpen(true);
    void fetchOrganizationDetail(organizationId);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <AnimatedPageHeader
          title="Organizzazioni"
          description="Gestisci contratti, posti disponibili e assegnazione dei proprietari."
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={openCreateForm} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            Nuova organizzazione
          </Button>
          <Button
            variant="outline"
            onClick={() => fetchOrganizations()}
            disabled={loadingList}
          >
            {loadingList && !syncingFromClerk ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {loadingList && !syncingFromClerk
              ? "Aggiornamento..."
              : "Aggiorna elenco"}
          </Button>
          <Button
            variant="outline"
            onClick={handleSyncFromClerk}
            disabled={loadingList || syncingFromClerk}
          >
            {syncingFromClerk && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {syncingFromClerk ? "Sincronizzazione..." : "Sincronizza da Clerk"}
          </Button>
        </div>
      </div>

      <div className={`grid gap-6 ${isFormOpen ? "lg:grid-cols-2" : ""}`}>
        <Card>
          <CardHeader>
            <CardTitle>Organizzazioni</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {listError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {listError}
              </div>
            )}
            {loadingList ? (
              <output className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                {syncingFromClerk
                  ? "Sincronizzazione con Clerk in corso..."
                  : "Aggiornamento dell'elenco..."}
              </output>
            ) : organizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Non ci sono ancora organizzazioni. Usa “Nuova organizzazione”
                per crearne una.
              </p>
            ) : (
              organizations.map((organization) => (
                <button
                  type="button"
                  key={organization.id}
                  className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                    selectedId === organization.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => openOrganizationDetail(organization.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{organization.name}</div>
                    <span className="text-xs text-muted-foreground">
                      {organization.activeMembers}/
                      {organization.contract?.seatLimit ?? "?"} posti
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {organization.slug} •{" "}
                    {organization.contract?.planLabel ?? "Nessun contratto"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Proprietario:{" "}
                    {organization.owner?.email ||
                      organization.pendingOwnerEmail ||
                      "In attesa"}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className={isFormOpen ? undefined : "hidden"}>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>
              {selectedId ? "Modifica organizzazione" : "Nuova organizzazione"}
            </CardTitle>
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Chiudi
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingDetail ? (
              <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                Caricamento dei dettagli...
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="org-name">
                    Nome
                  </label>
                  <input
                    id="org-name"
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="org-slug">
                    Slug
                  </label>
                  <input
                    id="org-slug"
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.slug}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        slug: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="org-owner">
                    Email del proprietario
                  </label>
                  <input
                    id="org-owner"
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.ownerEmail}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        ownerEmail: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="base-plan">
                      Piano base
                    </label>
                    <select
                      id="base-plan"
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      value={form.basePlan}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          basePlan: event.target
                            .value as ContractFormState["basePlan"],
                        }))
                      }
                    >
                      {ORGANIZATION_BASE_PLANS.map((plan) => (
                        <option key={plan} value={plan}>
                          {plan}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="seat-limit">
                      Limite posti
                    </label>
                    <input
                      id="seat-limit"
                      type="number"
                      min={1}
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      value={form.seatLimit}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          seatLimit: toNumber(
                            event.target.value,
                            current.seatLimit,
                          ),
                        }))
                      }
                    />
                  </div>
                </div>

                <details className="rounded-md border border-border bg-muted/20 px-3 py-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Impostazioni avanzate
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Lascia questi valori invariati per usare le impostazioni del
                    piano {planDefaults.planLabel}. Modificali solo quando il
                    contratto richiede limiti specifici.
                  </p>
                  <div className="mt-3 grid gap-2">
                    <label className="text-sm font-medium" htmlFor="plan-label">
                      Etichetta del piano
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="plan-label"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.planLabel}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            planLabel: event.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            planLabel: planDefaults.planLabel,
                          }))
                        }
                      >
                        Ripristina
                      </Button>
                    </div>
                    <label className="text-sm font-medium" htmlFor="model-tier">
                      Livello modello
                    </label>
                    <div className="flex gap-2">
                      <select
                        id="model-tier"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.modelTier}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            modelTier: event.target
                              .value as ContractFormState["modelTier"],
                          }))
                        }
                      >
                        {ORGANIZATION_MODEL_TIERS.map((tier) => (
                          <option key={tier} value={tier}>
                            {tier}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            modelTier: planDefaults.modelTier,
                          }))
                        }
                      >
                        Ripristina
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-3 text-xs">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">
                        Anteprima configurazione
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={applyBasePlanDefaults}
                      >
                        Usa valori del piano
                      </Button>
                    </div>
                    <p className="text-muted-foreground">
                      Valori del piano: {planDefaults.planLabel} /{" "}
                      {planDefaults.modelTier}. Configurazione effettiva:{" "}
                      {effectivePreview.modelTier},{" "}
                      {effectivePreview.limits.maxRequestsPerDay} richieste al
                      giorno, {effectivePreview.limits.maxInputTokensPerDay}{" "}
                      token in ingresso al giorno.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="req-limit"
                      >
                        Richieste massime al giorno
                      </label>
                      <input
                        id="req-limit"
                        type="number"
                        min={1}
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.maxRequestsPerDay}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxRequestsPerDay: toNumber(
                              event.target.value,
                              current.maxRequestsPerDay,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="cost-limit"
                      >
                        Costo massimo al giorno (USD)
                      </label>
                      <input
                        id="cost-limit"
                        type="number"
                        min={0}
                        step="0.01"
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.maxCostPerDay}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxCostPerDay: toNumber(
                              event.target.value,
                              current.maxCostPerDay,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="input-token-limit"
                      >
                        Token in ingresso al giorno
                      </label>
                      <input
                        id="input-token-limit"
                        type="number"
                        min={1}
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.maxInputTokensPerDay}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxInputTokensPerDay: toNumber(
                              event.target.value,
                              current.maxInputTokensPerDay,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="output-token-limit"
                      >
                        Token in uscita al giorno
                      </label>
                      <input
                        id="output-token-limit"
                        type="number"
                        min={1}
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.maxOutputTokensPerDay}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxOutputTokensPerDay: toNumber(
                              event.target.value,
                              current.maxOutputTokensPerDay,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="context-limit"
                      >
                        Messaggi massimi nel contesto
                      </label>
                      <input
                        id="context-limit"
                        type="number"
                        min={1}
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.maxContextMessages}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxContextMessages: toNumber(
                              event.target.value,
                              current.maxContextMessages,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                </details>

                {selectedId ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      onClick={handleUpdate}
                      disabled={saving || deleting}
                      className="w-full"
                    >
                      {saving && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {saving ? "Salvataggio..." : "Salva modifiche"}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteRequest}
                      disabled={saving || deleting}
                      className="w-full"
                    >
                      {deleting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      {deleting ? "Eliminazione..." : "Elimina organizzazione"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={handleCreate}
                    disabled={saving}
                    className="w-full"
                  >
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {saving ? "Creazione..." : "Crea organizzazione"}
                  </Button>
                )}

                <ConfirmDialog
                  open={isDeleteDialogOpen}
                  onOpenChange={setIsDeleteDialogOpen}
                  onConfirm={handleDeleteConfirm}
                  title="Eliminare l'organizzazione?"
                  description={`“${selectedOrganization?.name || "Questa organizzazione"}” verrà rimossa definitivamente da Anthon e Clerk.`}
                  confirmText="Elimina"
                  cancelText="Annulla"
                  variant="destructive"
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedId && (
        <Card>
          <CardHeader>
            <CardTitle>Registro attività</CardTitle>
          </CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Non ci sono ancora attività registrate.
              </p>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="font-medium">
                      {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("it-IT")} •{" "}
                      {ACTOR_TYPE_LABELS[log.actorType] ?? log.actorType} •{" "}
                      {log.actorUser?.email || "sistema"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
