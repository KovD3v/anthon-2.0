"use client";

import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { BenchmarkTestCase } from "../../types";

export default function TestCaseEditPage() {
  const params = useParams();
  const router = useRouter();
  const isNew = params.id === "new";
  const testCaseId = isNew ? null : (params.id as string);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testCase, setTestCase] = useState<Partial<BenchmarkTestCase>>({
    name: "",
    category: "TOOL_USAGE",
    userMessage: "",
    description: "",
    externalId: "",
    setup: { session: [], memories: [], userContext: {} },
    expectedBehavior: {},
    isActive: true,
  });

  async function fetchTestCase() {
    if (!testCaseId) return;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/admin/benchmark/test-cases?id=${testCaseId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch test case");
      const data = await res.json();
      if (data.testCase) {
        setTestCase(data.testCase);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to load test case");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTestCase();
  }, [testCaseId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let setupData = testCase.setup || {};
      let expectedBehaviorData = testCase.expectedBehavior || {};

      // Parse JSON fields if they're strings
      if (typeof setupData === "string") {
        setupData = JSON.parse(setupData);
      }
      if (typeof expectedBehaviorData === "string") {
        expectedBehaviorData = JSON.parse(expectedBehaviorData);
      }

      const payload = {
        id: testCaseId,
        name: testCase.name,
        category: testCase.category,
        userMessage: testCase.userMessage,
        description: testCase.description,
        externalId: testCase.externalId,
        setup: setupData,
        expectedBehavior: expectedBehaviorData,
        isActive: testCase.isActive,
      };

      const res = await fetch("/api/admin/benchmark/test-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save test case");
      router.push("/admin/benchmark/datasets");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!testCaseId) return;
    if (!confirm("Are you sure you want to delete this test case?")) return;

    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/benchmark/test-cases?id=${testCaseId}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/admin/benchmark/datasets");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const prettifyJson = (fieldId: string) => {
    const el = document.getElementById(fieldId) as HTMLTextAreaElement;
    if (!el) return;
    try {
      const parsed = JSON.parse(el.value);
      el.value = JSON.stringify(parsed, null, 2);
      // Update state
      if (fieldId === "setup-json") {
        setTestCase((prev) => ({ ...prev, setup: parsed }));
      } else if (fieldId === "expected-json") {
        setTestCase((prev) => ({ ...prev, expectedBehavior: parsed }));
      }
    } catch {
      alert("Invalid JSON");
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/benchmark/datasets">
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold">
                  {isNew ? "New Test Case" : "Edit Test Case"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {testCaseId
                    ? `ID: ${testCaseId}`
                    : "Create a new benchmark test"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isNew && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Name */}
          <div>
            <Label
              htmlFor="tc-name"
              className="text-xs font-medium text-muted-foreground uppercase"
            >
              Name
            </Label>
            <Input
              id="tc-name"
              value={testCase.name || ""}
              onChange={(e) =>
                setTestCase((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              className="mt-1 bg-white/5 border-white/10"
              placeholder="e.g., Tool Selection for Weather Query"
            />
          </div>

          {/* Category & External ID */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase">
                Category
              </Label>
              <Select
                value={testCase.category || "TOOL_USAGE"}
                onValueChange={(val) =>
                  setTestCase((prev) => ({
                    ...prev,
                    category: val as "TOOL_USAGE" | "WRITING_QUALITY",
                  }))
                }
              >
                <SelectTrigger className="mt-1 bg-white/5 border-white/10">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOOL_USAGE">Tool Usage</SelectItem>
                  <SelectItem value="WRITING_QUALITY">
                    Writing Quality
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label
                htmlFor="tc-externalId"
                className="text-xs font-medium text-muted-foreground uppercase"
              >
                External ID
              </Label>
              <Input
                id="tc-externalId"
                value={testCase.externalId || ""}
                onChange={(e) =>
                  setTestCase((prev) => ({
                    ...prev,
                    externalId: e.target.value,
                  }))
                }
                className="mt-1 bg-white/5 border-white/10"
                placeholder="e.g., tool_001"
              />
            </div>
          </div>

          {/* User Message */}
          <div>
            <Label
              htmlFor="tc-userMessage"
              className="text-xs font-medium text-muted-foreground uppercase"
            >
              User Message
            </Label>
            <Textarea
              id="tc-userMessage"
              value={testCase.userMessage || ""}
              onChange={(e) =>
                setTestCase((prev) => ({
                  ...prev,
                  userMessage: e.target.value,
                }))
              }
              className="mt-1 bg-white/5 border-white/10 min-h-[120px] resize-y"
              placeholder="The message the AI will respond to..."
            />
          </div>

          {/* Description */}
          <div>
            <Label
              htmlFor="tc-description"
              className="text-xs font-medium text-muted-foreground uppercase"
            >
              Description
            </Label>
            <Textarea
              id="tc-description"
              value={testCase.description || ""}
              onChange={(e) =>
                setTestCase((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="mt-1 bg-white/5 border-white/10 min-h-[80px] resize-y"
              placeholder="What this test case evaluates..."
            />
          </div>

          {/* JSON Editors */}
          <div className="grid grid-cols-2 gap-6">
            {/* Setup */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-medium text-muted-foreground uppercase">
                  Setup (JSON)
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => prettifyJson("setup-json")}
                  className="h-6 text-[10px] px-2"
                >
                  Prettify
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">
                Includes session, memories, userContext
              </p>
              <Textarea
                id="setup-json"
                defaultValue={JSON.stringify(
                  testCase.setup || {
                    session: [],
                    memories: [],
                    userContext: {},
                  },
                  null,
                  2,
                )}
                onBlur={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setTestCase((prev) => ({
                      ...prev,
                      setup: parsed,
                    }));
                  } catch {
                    // Keep as string for now
                  }
                }}
                className="bg-white/5 border-white/10 font-mono text-xs min-h-[300px] resize-y"
              />
            </div>

            {/* Expected Behavior */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-medium text-muted-foreground uppercase">
                  Expected Behavior (JSON)
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => prettifyJson("expected-json")}
                  className="h-6 text-[10px] px-2"
                >
                  Prettify
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">
                Validation rules
              </p>
              <Textarea
                id="expected-json"
                defaultValue={JSON.stringify(
                  testCase.expectedBehavior || {},
                  null,
                  2,
                )}
                onBlur={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setTestCase((prev) => ({
                      ...prev,
                      expectedBehavior: parsed,
                    }));
                  } catch {
                    // Keep as string for now
                  }
                }}
                className="bg-white/5 border-white/10 font-mono text-xs min-h-[300px] resize-y"
              />
            </div>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
            <input
              type="checkbox"
              id="tc-active"
              checked={testCase.isActive ?? true}
              onChange={(e) =>
                setTestCase((prev) => ({
                  ...prev,
                  isActive: e.target.checked,
                }))
              }
              className="rounded bg-white/5 border-white/10"
            />
            <Label htmlFor="tc-active" className="text-sm cursor-pointer">
              Active — include this test case in benchmark runs
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
