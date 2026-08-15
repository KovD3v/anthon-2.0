"use client";

import { Loader2, Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CoachingProfile = {
  sport: string | null;
  goal: string | null;
  experience: string | null;
};
type CoachingMemory = {
  id: string;
  content: string;
  category: string;
  updatedAt: string;
};
type CoachingContext = {
  profile: CoachingProfile;
  memories: CoachingMemory[];
};

const categoryLabels: Record<string, string> = {
  identity: "Identità",
  sport: "Sport",
  goal: "Obiettivo",
  preference: "Preferenza",
  health: "Salute",
  schedule: "Programma",
  other: "Altro",
};

export function CoachingContextSection() {
  const [context, setContext] = useState<CoachingContext | null>(null);
  const [draft, setDraft] = useState<CoachingProfile | null>(null);
  const [editing, setEditing] = useState<CoachingMemory | null>(null);
  const [deleting, setDeleting] = useState<CoachingMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch("/api/coaching-context");
      if (!response.ok) throw new Error();
      const data = (await response.json()) as CoachingContext;
      setContext(data);
      setDraft(data.profile);
    } catch {
      setFailed(true);
      toast.error("Impossibile caricare il contesto di coaching");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile() {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch("/api/coaching-context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error();
      const profile = (await response.json()) as CoachingProfile;
      setContext((value) => (value ? { ...value, profile } : value));
      setDraft(profile);
      toast.success("Contesto di coaching aggiornato");
    } catch {
      toast.error("Impossibile salvare il contesto");
    } finally {
      setSaving(false);
    }
  }

  async function saveMemory() {
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/coaching-context/memories/${encodeURIComponent(editing.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: editing.content,
            category: editing.category,
          }),
        },
      );
      if (!response.ok) throw new Error();
      const memory = (await response.json()) as CoachingMemory;
      setContext((value) =>
        value
          ? {
              ...value,
              memories: value.memories.map((item) =>
                item.id === memory.id ? memory : item,
              ),
            }
          : value,
      );
      setEditing(null);
      toast.success("Memoria corretta");
    } catch {
      toast.error("Impossibile correggere la memoria");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMemory() {
    if (!deleting) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/coaching-context/memories/${encodeURIComponent(deleting.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error();
      setContext((value) =>
        value
          ? {
              ...value,
              memories: value.memories.filter(
                (item) => item.id !== deleting.id,
              ),
            }
          : value,
      );
      setDeleting(null);
      toast.success("Memoria eliminata");
    } catch {
      toast.error("Impossibile eliminare la memoria");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <output
        className="flex min-h-40 items-center justify-center border-t border-border/70 px-6 py-8"
        aria-label="Caricamento contesto di coaching"
      >
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </output>
    );
  }

  if (failed || !context || !draft) {
    return (
      <div className="border-t border-border/70 px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Il contesto di coaching non è disponibile.
        </p>
        <Button className="mt-4 gap-2" variant="outline" onClick={load}>
          <RotateCcw className="h-4 w-4" />
          Riprova
        </Button>
      </div>
    );
  }

  return (
    <>
      <section className="border-t border-border/70">
        <div className="px-6 pb-4 pt-8 sm:px-8">
          <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
            Memoria
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Controlla ciò che Anthon usa per personalizzare il coaching.
          </p>
        </div>

        <div className="space-y-5 px-6 pb-8 pt-3 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileInput
              id="coaching-sport"
              label="Sport"
              value={draft.sport ?? ""}
              placeholder="Es. tennis"
              onChange={(sport) => setDraft({ ...draft, sport })}
            />
            <ProfileInput
              id="coaching-experience"
              label="Esperienza"
              value={draft.experience ?? ""}
              placeholder="Es. livello agonistico"
              onChange={(experience) => setDraft({ ...draft, experience })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coaching-goal">Obiettivo</Label>
            <textarea
              id="coaching-goal"
              maxLength={500}
              value={draft.goal ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, goal: event.target.value })
              }
              placeholder="Qual è il tuo obiettivo principale?"
              className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setDraft(context.profile)}
            >
              Annulla modifiche
            </Button>
            <Button className="gap-2" disabled={saving} onClick={saveProfile}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salva profilo
            </Button>
          </div>
        </div>

        <div className="border-t border-border/70 px-6 py-7 sm:px-8">
          <h3 className="font-display text-xl font-bold uppercase tracking-tight">
            Ricordi dalle conversazioni
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Fatti ricordati dalle conversazioni. Puoi correggerli o eliminarli.
          </p>
          {context.memories.length === 0 ? (
            <p className="mt-5 border-t border-dashed border-border py-5 text-sm text-muted-foreground">
              Nessuna memoria salvata.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-border/70 border-y border-border/70">
              {context.memories.map((memory) => (
                <li key={memory.id} className="py-4">
                  {editing?.id === memory.id ? (
                    <MemoryEditor
                      memory={editing}
                      saving={saving}
                      onChange={setEditing}
                      onCancel={() => setEditing(null)}
                      onSave={saveMemory}
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className="font-mono text-[0.65rem] uppercase tracking-wider text-primary">
                          {categoryLabels[memory.category] ?? "Altro"}
                        </span>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                          {memory.content}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Correggi memoria"
                          onClick={() => setEditing(memory)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Elimina memoria"
                          onClick={() => setDeleting(memory)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onConfirm={deleteMemory}
        title="Eliminare questa memoria?"
        description="Anthon non userà più questa informazione nelle conversazioni future."
        confirmText="Elimina memoria"
        cancelText="Annulla"
        variant="destructive"
      />
    </>
  );
}

function ProfileInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        maxLength={500}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function MemoryEditor({
  memory,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  memory: CoachingMemory;
  saving: boolean;
  onChange: (memory: CoachingMemory) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <Label htmlFor={`memory-${memory.id}`}>Correggi memoria</Label>
      <textarea
        id={`memory-${memory.id}`}
        maxLength={1000}
        value={memory.content}
        onChange={(event) =>
          onChange({ ...memory, content: event.target.value })
        }
        className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
      />
      <select
        aria-label="Categoria memoria"
        value={memory.category}
        onChange={(event) =>
          onChange({ ...memory, category: event.target.value })
        }
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        {Object.entries(categoryLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Annulla
        </Button>
        <Button onClick={onSave} disabled={saving || !memory.content.trim()}>
          Salva memoria
        </Button>
      </div>
    </div>
  );
}
