"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
            throw new Error(error?.error || "Admin access required");
          }
          throw new Error(
            error?.details?.message ||
              error?.error ||
              "Failed to fetch organizations",
          );
        }
        const data = (await res.json()) as {
          organizations: OrganizationSummary[];
        };
        const nextOrganizations = data.organizations || [];
        setOrganizations(nextOrganizations);
        if (
          selectedId &&
          !nextOrganizations.some(
            (organization) => organization.id === selectedId,
          )
        ) {
          setSelectedOrganization(null);
          setAuditLogs([]);
        }
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load organizations";
        setListError(message);
        toast.error(message);
        return false;
      } finally {
        setLoadingList(false);
      }
    },
    [selectedId],
  );

  async function handleSyncFromClerk() {
    setSyncingFromClerk(true);
    try {
      const ok = await fetchOrganizations({ syncFromClerk: true });
      if (ok) {
        toast.success("Synced organizations from Clerk");
      }
    } finally {
      setSyncingFromClerk(false);
    }
  }

  const fetchOrganizationDetail = useCallback(
    async (organizationId: string) => {
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
          throw new Error(error.error || "Failed to fetch organization detail");
        }

        if (!auditRes.ok) {
          const error = await auditRes.json();
          throw new Error(error.error || "Failed to fetch audit logs");
        }

        const detailPayload = (await detailRes.json()) as {
          organization: OrganizationDetail;
        };
        const auditPayload = (await auditRes.json()) as {
          logs: OrganizationAuditLog[];
        };

        setSelectedOrganization(detailPayload.organization);
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
            contract?.maxOutputTokensPerDay ??
            DEFAULT_FORM.maxOutputTokensPerDay,
          maxCostPerDay: contract?.maxCostPerDay ?? DEFAULT_FORM.maxCostPerDay,
          maxContextMessages:
            contract?.maxContextMessages ?? DEFAULT_FORM.maxContextMessages,
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load detail",
        );
      } finally {
        setLoadingDetail(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const contractPayload = useMemo<OrganizationContractInput>(
    () => ({
      basePlan: form.basePlan,
      seatLimit: toNumber(String(form.seatLimit), 1),
      planLabel: form.planLabel,
      modelTier: form.modelTier,
      maxRequestsPerDay: toNumber(String(form.maxRequestsPerDay), 1),
      maxInputTokensPerDay: toNumber(String(form.maxInputTokensPerDay), 1),
      maxOutputTokensPerDay: toNumber(String(form.maxOutputTokensPerDay), 1),
      maxCostPerDay: toNumber(String(form.maxCostPerDay), 0),
      maxContextMessages: toNumber(String(form.maxContextMessages), 1),
    }),
    [form],
  );

  const planDefaults = useMemo(
    () => resolveOrgPlanDefaults(form.basePlan),
    [form.basePlan],
  );

  const effectivePreview = useMemo(
    () => applyOrgOverrides(contractPayload).effective,
    [contractPayload],
  );

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
      toast.error("Organization name is required");
      return;
    }
    if (!form.ownerEmail.includes("@")) {
      toast.error("Owner email is required");
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
        throw new Error(error.error || "Failed to create organization");
      }

      const data = await res.json();
      toast.success("Organization created");
      await fetchOrganizations();
      if (data.organization?.id) {
        await fetchOrganizationDetail(data.organization.id);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create organization",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!selectedId) {
      toast.error("Select an organization first");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Organization name is required");
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
        throw new Error(error.error || "Failed to update organization");
      }

      toast.success("Organization updated");
      await fetchOrganizations();
      await fetchOrganizationDetail(selectedId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update organization",
      );
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setSelectedOrganization(null);
    setAuditLogs([]);
    setForm(DEFAULT_FORM);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground">
            Create and manage contracted organizations, seat limits, and owner
            assignment.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetForm}>
            New Organization
          </Button>
          <Button
            variant="outline"
            onClick={() => fetchOrganizations()}
            disabled={loadingList}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handleSyncFromClerk}
            disabled={loadingList || syncingFromClerk}
          >
            {(loadingList || syncingFromClerk) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Sync from Clerk
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {listError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {listError}
              </div>
            )}
            {loadingList ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : organizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No organizations yet.
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
                  onClick={() => fetchOrganizationDetail(organization.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{organization.name}</div>
                    <span className="text-xs text-muted-foreground">
                      {organization.activeMembers}/
                      {organization.contract?.seatLimit ?? "?"} seats
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {organization.slug} •{" "}
                    {organization.contract?.planLabel ?? "No contract"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Owner:{" "}
                    {organization.owner?.email ||
                      organization.pendingOwnerEmail ||
                      "Pending"}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {selectedId ? "Update Organization" : "Create Organization"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="org-name">
                    Name
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
                    Owner Email
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

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="base-plan">
                      Base Plan
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
                      Seat Limit
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
                    Advanced Overrides
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Leave this unchanged to use the base plan tier (
                    {planDefaults.modelTier}). Change only when an enterprise
                    contract requires a higher or lower model access tier.
                  </p>
                  <div className="mt-3 grid gap-2">
                    <label className="text-sm font-medium" htmlFor="plan-label">
                      Plan Label Override
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
                        Default
                      </Button>
                    </div>
                    <label className="text-sm font-medium" htmlFor="model-tier">
                      Model Tier Override
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
                        Default
                      </Button>
                    </div>
                  </div>
                </details>

                <div className="rounded-md border border-border bg-muted/30 px-3 py-3 text-xs">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">Enterprise Overrides</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={applyBasePlanDefaults}
                    >
                      Use Plan Defaults
                    </Button>
                  </div>
                  <p className="text-muted-foreground">
                    Base plan default: {planDefaults.planLabel} /{" "}
                    {planDefaults.modelTier}. Effective currently:{" "}
                    {effectivePreview.modelTier},{" "}
                    {effectivePreview.limits.maxRequestsPerDay} req/day,{" "}
                    {effectivePreview.limits.maxInputTokensPerDay} input
                    tokens/day.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor="req-limit">
                      Max Requests/Day
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
                    <label className="text-sm font-medium" htmlFor="cost-limit">
                      Max Cost/Day (USD)
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

                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="input-token-limit"
                    >
                      Input Tokens/Day
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
                      Output Tokens/Day
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
                      Max Context Messages
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

                <Button
                  onClick={selectedId ? handleUpdate : handleCreate}
                  disabled={saving}
                  className="w-full"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {selectedId ? "Update Organization" : "Create Organization"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedId && (
        <Card>
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
          </CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No audit entries yet.
              </p>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="font-medium">{log.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()} •{" "}
                      {log.actorType} • {log.actorUser?.email || "system"}
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
