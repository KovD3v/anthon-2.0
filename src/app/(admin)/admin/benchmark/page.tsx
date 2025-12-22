"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
	AlertCircle,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Clock,
	Code,
	FlaskConical,
	Loader2,
	MessageSquare,
	Play,
	RefreshCw,
	Star,
	Trash2,
	Trophy,
	Wrench,
	XCircle,
	Eye,
	X,
	User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Static dataset for user prompts (loaded at build time)
import datasetJson from "@/lib/benchmark/dataset.json";
const dataset = datasetJson as unknown as {
	testCases: Array<{
		id: string;
		name: string;
		userMessage: string;
		category: string;
		setup?: {
			session?: Array<{ role: string; content: string }>;
			memories?: Array<{ key: string; value: string }>;
			userContext?: {
				profile?: Record<string, string | null>;
				preferences?: Record<string, string | null>;
			};
		};
	}>;
};

interface BenchmarkRun {
	id: string;
	name: string;
	description?: string;
	models: string[];
	status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
	startedAt?: string;
	endedAt?: string;
	approved?: boolean;
	createdAt: string;
	_count?: { results: number };
}

interface ModelScore {
	modelId: string;
	testCount: number;
	avgOverallScore: number;
	avgInferenceTimeMs: number;
	avgCostUsd: number;
	avgToolUsageScore: number | null;
	avgWritingQualityScore: number | null;
	totalCostUsd: number;
}

interface BenchmarkResult {
	id: string;
	testCaseId: string;
	category: string;
	modelId: string;
	inferenceTimeMs: number;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	responseText: string;
	toolCalls?: Array<{ name: string; args: unknown; result?: unknown }>;
	toolUsageScore?: number;
	toolUsageReasoning?: string;
	writingQualityScore?: number;
	writingQualityReasoning?: string;
	overallScore: number;
	adminScore?: number;
	adminReasoning?: string;
	finalScore?: number;
	// Session and memories context
	memoriesUsed?: string[];
	sessionUsed?: { messageCount: number; sessions: number };
}

// Available models for benchmarking
const AVAILABLE_MODELS = [
	"google/gemini-2.0-flash-001",
	"google/gemini-2.0-flash-lite-001",
	"google/gemini-2.5-flash-lite-preview-09-2025",
	"xiaomi/mimo-v2-flash:free",
];

export default function BenchmarkPage() {
	const [runs, setRuns] = useState<BenchmarkRun[]>([]);
	const [selectedRun, setSelectedRun] = useState<BenchmarkRun | null>(null);
	const [modelScores, setModelScores] = useState<ModelScore[]>([]);
	const [results, setResults] = useState<BenchmarkResult[]>([]);
	const [loading, setLoading] = useState(true);
	const [starting, setStarting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Navigation state
	const [selectedTestCaseId, setSelectedTestCaseId] = useState<string | null>(
		null
	);
	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
	const [detailModalOpen, setDetailModalOpen] = useState(false);
	const [selectedResult, setSelectedResult] =
		useState<BenchmarkResult | null>(null);

	// Benchmark config state
	const [configModalOpen, setConfigModalOpen] = useState(false);
	const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());
	const [selectedModels, setSelectedModels] = useState<Set<string>>(
		new Set(AVAILABLE_MODELS)
	);

	const testCaseIds = [...new Set(results.map((r) => r.testCaseId))];
	const modelIds = [...new Set(results.map((r) => r.modelId))];

	const fetchRuns = useCallback(async () => {
		try {
			const res = await fetch("/api/admin/benchmark");
			if (!res.ok) throw new Error("Failed to fetch benchmark runs");
			const data = await res.json();
			setRuns(data.runs || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	}, []);

	const fetchRunDetails = useCallback(async (runId: string) => {
		try {
			const res = await fetch(`/api/admin/benchmark?runId=${runId}`);
			if (!res.ok) throw new Error("Failed to fetch run details");
			const data = await res.json();
			setSelectedRun(data.run);
			setModelScores(data.modelScores || []);
			setResults(data.run?.results || []);
			// Auto-select first test case and model
			if (data.run?.results?.length > 0) {
				const firstResult = data.run.results[0];
				setSelectedTestCaseId(firstResult.testCaseId);
				setSelectedModelId(null); // Show all models for this test
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		}
	}, []);

	const startBenchmark = async (options?: {
		testCaseIds?: string[];
		models?: string[];
	}) => {
		setStarting(true);
		try {
			const res = await fetch("/api/admin/benchmark", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					testCaseIds: options?.testCaseIds,
					models: options?.models,
				}),
			});
			if (!res.ok) throw new Error("Failed to start benchmark");
			const data = await res.json();
			alert(`Benchmark started! Run ID: ${data.runId}`);
			fetchRuns();
		} catch (err) {
			alert(
				err instanceof Error ? err.message : "Failed to start benchmark"
			);
		} finally {
			setStarting(false);
		}
	};

	// Start benchmark with selected tests/models
	const startSelectedBenchmark = async () => {
		const testsToRun =
			selectedTests.size > 0 ? [...selectedTests] : undefined;
		const modelsToRun =
			selectedModels.size > 0 ? [...selectedModels] : undefined;
		await startBenchmark({ testCaseIds: testsToRun, models: modelsToRun });
		setConfigModalOpen(false);
	};

	// Toggle helpers
	const toggleTest = (testId: string) => {
		setSelectedTests((prev) => {
			const next = new Set(prev);
			if (next.has(testId)) {
				next.delete(testId);
			} else {
				next.add(testId);
			}
			return next;
		});
	};

	const toggleModel = (modelId: string) => {
		setSelectedModels((prev) => {
			const next = new Set(prev);
			if (next.has(modelId)) {
				next.delete(modelId);
			} else {
				next.add(modelId);
			}
			return next;
		});
	};

	const selectAllTests = () => {
		setSelectedTests(new Set(dataset.testCases.map((tc) => tc.id)));
	};

	const clearAllTests = () => {
		setSelectedTests(new Set());
	};

	const deleteRun = async (runId: string) => {
		if (!confirm("Delete this benchmark run?")) return;
		try {
			const res = await fetch(`/api/admin/benchmark?runId=${runId}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Failed to delete");
			if (selectedRun?.id === runId) {
				setSelectedRun(null);
				setResults([]);
				setModelScores([]);
			}
			fetchRuns();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to delete");
		}
	};

	const submitAdminScore = async (
		resultId: string,
		adminScore: number,
		adminReasoning: string
	) => {
		try {
			const res = await fetch("/api/admin/benchmark", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ resultId, adminScore, adminReasoning }),
			});
			if (!res.ok) throw new Error("Failed to submit");
			if (selectedRun) fetchRunDetails(selectedRun.id);
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to submit");
		}
	};

	// Get results for current test case
	const currentTestResults = selectedTestCaseId
		? results.filter((r) => r.testCaseId === selectedTestCaseId)
		: [];

	// Navigate between test cases
	const currentTestIndex = testCaseIds.indexOf(selectedTestCaseId || "");
	const goToPrevTest = () => {
		if (currentTestIndex > 0) {
			setSelectedTestCaseId(testCaseIds[currentTestIndex - 1]);
		}
	};
	const goToNextTest = () => {
		if (currentTestIndex < testCaseIds.length - 1) {
			setSelectedTestCaseId(testCaseIds[currentTestIndex + 1]);
		}
	};

	useEffect(() => {
		fetchRuns();
	}, [fetchRuns]);

	if (loading) {
		return (
			<div className="flex h-[50vh] items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold flex items-center gap-2">
						<FlaskConical className="h-6 w-6 text-primary" />
						AI Benchmark
					</h1>
					<p className="text-sm text-muted-foreground">
						Compare AI models
					</p>
				</div>
				<div className="flex gap-2">
					<button
						onClick={fetchRuns}
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10 transition-colors">
						<RefreshCw className="h-4 w-4" />
					</button>
					<button
						onClick={() => setConfigModalOpen(true)}
						disabled={starting}
						className="inline-flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50">
						⚙️ Select Tests ({selectedTests.size || "all"})
					</button>
					<button
						onClick={() => startBenchmark()}
						disabled={starting}
						className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
						{starting ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Play className="h-4 w-4" />
						)}
						Start All
					</button>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-4">
				{/* Sidebar: Runs List */}
				<div className="lg:col-span-1">
					<Card className="border-white/5 bg-background/40">
						<CardHeader className="py-3">
							<CardTitle className="text-sm">
								Runs ({runs.length})
							</CardTitle>
						</CardHeader>
						<CardContent className="max-h-[500px] overflow-y-auto space-y-1 p-2">
							{runs.map((run) => (
								<div
									key={run.id}
									className={cn(
										"relative p-2 rounded-lg cursor-pointer group transition-all",
										selectedRun?.id === run.id
											? "bg-primary/20 border border-primary/30"
											: "hover:bg-white/5"
									)}
									onClick={() => fetchRunDetails(run.id)}>
									<div className="flex items-center justify-between">
										<div className="min-w-0 flex-1">
											<p className="text-xs font-medium truncate">
												{run.name}
											</p>
											<p className="text-[10px] text-muted-foreground">
												{new Date(
													run.createdAt
												).toLocaleDateString()}
											</p>
										</div>
										<StatusBadge
											status={run.status}
											small
										/>
									</div>
									<button
										onClick={(e) => {
											e.stopPropagation();
											deleteRun(run.id);
										}}
										className="absolute right-1 top-1 p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 rounded text-destructive">
										<Trash2 className="h-3 w-3" />
									</button>
								</div>
							))}
						</CardContent>
					</Card>
				</div>

				{/* Main Content */}
				<div className="lg:col-span-3 space-y-4">
					{selectedRun ? (
						<>
							{/* Model Leaderboard */}
							{modelScores.length > 0 && (
								<Card className="border-white/5 bg-background/40">
									<CardHeader className="py-3">
										<CardTitle className="text-sm flex items-center gap-2">
											<Trophy className="h-4 w-4 text-amber-500" />
											Leaderboard
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="flex gap-3 overflow-x-auto pb-2">
											{modelScores
												.sort(
													(a, b) =>
														b.avgOverallScore -
														a.avgOverallScore
												)
												.map((score, i) => (
													<div
														key={score.modelId}
														className={cn(
															"shrink-0 p-3 rounded-lg border text-center min-w-[140px]",
															i === 0
																? "border-amber-500/30 bg-amber-500/10"
																: "border-white/5 bg-white/5"
														)}>
														<div className="text-xs font-medium mb-1">
															{i === 0 && "🥇 "}
															{i === 1 && "🥈 "}
															{i === 2 && "🥉 "}
															{
																score.modelId.split(
																	"/"
																)[1]
															}
														</div>
														<div className="text-2xl font-bold">
															{score.avgOverallScore.toFixed(
																1
															)}
														</div>
														<div className="text-[10px] text-muted-foreground">
															{Math.round(
																score.avgInferenceTimeMs
															)}
															ms · $
															{score.totalCostUsd.toFixed(
																4
															)}
														</div>
													</div>
												))}
										</div>
									</CardContent>
								</Card>
							)}

							{/* Test Case Navigator */}
							{testCaseIds.length > 0 && (
								<Card className="border-white/5 bg-background/40">
									<CardHeader className="py-3">
										<div className="flex items-center justify-between">
											<CardTitle className="text-sm flex items-center gap-2">
												<MessageSquare className="h-4 w-4" />
												Test: {selectedTestCaseId}
											</CardTitle>
											<div className="flex items-center gap-2">
												<button
													onClick={goToPrevTest}
													disabled={
														currentTestIndex <= 0
													}
													className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
													<ChevronLeft className="h-4 w-4" />
												</button>
												<span className="text-xs text-muted-foreground">
													{currentTestIndex + 1} /{" "}
													{testCaseIds.length}
												</span>
												<button
													onClick={goToNextTest}
													disabled={
														currentTestIndex >=
														testCaseIds.length - 1
													}
													className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
													<ChevronRight className="h-4 w-4" />
												</button>
											</div>
										</div>
									</CardHeader>
									<CardContent>
										{/* Test case selector dropdown */}
										<select
											value={selectedTestCaseId || ""}
											onChange={(e) =>
												setSelectedTestCaseId(
													e.target.value
												)
											}
											className="w-full mb-4 p-2 bg-black/20 border border-white/10 rounded text-sm">
											{testCaseIds.map((id) => {
												const sample = results.find(
													(r) => r.testCaseId === id
												);
												return (
													<option key={id} value={id}>
														{id} (
														{sample?.category ===
														"TOOL_USAGE"
															? "🔧"
															: "✍️"}
														)
													</option>
												);
											})}
										</select>

										{/* Results Table for current test */}
										<div className="border border-white/10 rounded-lg overflow-hidden">
											<table className="w-full text-sm">
												<thead className="bg-white/5">
													<tr>
														<th className="text-left p-2 font-medium">
															Model
														</th>
														<th className="text-center p-2 font-medium">
															AI
														</th>
														<th className="text-center p-2 font-medium">
															Admin
														</th>
														<th className="text-center p-2 font-medium">
															Final
														</th>
														<th className="text-right p-2 font-medium">
															Time
														</th>
														<th className="text-center p-2 font-medium">
															Tools
														</th>
														<th className="text-center p-2 font-medium">
															View
														</th>
													</tr>
												</thead>
												<tbody>
													{currentTestResults.map(
														(result) => (
															<tr
																key={result.id}
																className="border-t border-white/5 hover:bg-white/5">
																<td className="p-2 font-medium text-xs">
																	{
																		result.modelId.split(
																			"/"
																		)[1]
																	}
																</td>
																<td className="p-2 text-center">
																	<ScoreBadge
																		score={
																			result.overallScore
																		}
																	/>
																</td>
																<td className="p-2 text-center">
																	{result.adminScore !==
																		undefined &&
																	result.adminScore !==
																		null ? (
																		<ScoreBadge
																			score={
																				result.adminScore
																			}
																		/>
																	) : (
																		<span className="text-muted-foreground text-xs">
																			—
																		</span>
																	)}
																</td>
																<td className="p-2 text-center">
																	{result.finalScore !==
																		undefined &&
																	result.finalScore !==
																		null ? (
																		<ScoreBadge
																			score={
																				result.finalScore
																			}
																			large
																		/>
																	) : (
																		<ScoreBadge
																			score={
																				result.overallScore
																			}
																		/>
																	)}
																</td>
																<td className="p-2 text-right text-xs font-mono text-muted-foreground">
																	{
																		result.inferenceTimeMs
																	}
																	ms
																</td>
																<td className="p-2 text-center">
																	{result.toolCalls &&
																	result
																		.toolCalls
																		.length >
																		0 ? (
																		<span className="inline-flex items-center gap-1 text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
																			<Wrench className="h-3 w-3" />
																			{
																				result
																					.toolCalls
																					.length
																			}
																		</span>
																	) : (
																		<span className="text-muted-foreground text-xs">
																			—
																		</span>
																	)}
																</td>
																<td className="p-2 text-center">
																	<button
																		onClick={() => {
																			setSelectedResult(
																				result
																			);
																			setDetailModalOpen(
																				true
																			);
																		}}
																		className="p-1 rounded hover:bg-white/10 text-primary">
																		<Eye className="h-4 w-4" />
																	</button>
																</td>
															</tr>
														)
													)}
												</tbody>
											</table>
										</div>
									</CardContent>
								</Card>
							)}
						</>
					) : (
						<Card className="border-white/5 bg-background/40">
							<CardContent className="flex flex-col items-center justify-center py-20">
								<FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
								<p className="text-muted-foreground">
									Select a benchmark run
								</p>
							</CardContent>
						</Card>
					)}
				</div>
			</div>

			{/* Config Modal - Test/Model Selection */}
			<AnimatePresence>
				{configModalOpen && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
						onClick={() => setConfigModalOpen(false)}>
						<motion.div
							initial={{ scale: 0.95, y: 20 }}
							animate={{ scale: 1, y: 0 }}
							exit={{ scale: 0.95, y: 20 }}
							className="bg-background border border-white/10 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
							onClick={(e) => e.stopPropagation()}>
							<div className="flex items-center justify-between p-4 border-b border-white/10">
								<h2 className="font-semibold">
									Configure Benchmark
								</h2>
								<button
									onClick={() => setConfigModalOpen(false)}
									className="p-2 hover:bg-white/10 rounded-lg">
									<X className="h-5 w-5" />
								</button>
							</div>
							<div className="p-4 grid grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto">
								{/* Models */}
								<div>
									<h3 className="text-sm font-medium mb-3">
										Models ({selectedModels.size})
									</h3>
									<div className="space-y-2">
										{AVAILABLE_MODELS.map((modelId) => (
											<label
												key={modelId}
												className="flex items-center gap-2 p-2 rounded hover:bg-white/5 cursor-pointer">
												<input
													type="checkbox"
													checked={selectedModels.has(
														modelId
													)}
													onChange={() =>
														toggleModel(modelId)
													}
													className="rounded"
												/>
												<span className="text-sm">
													{modelId.split("/")[1]}
												</span>
											</label>
										))}
									</div>
								</div>
								{/* Tests */}
								<div>
									<div className="flex items-center justify-between mb-3">
										<h3 className="text-sm font-medium">
											Tests ({selectedTests.size || "all"}
											)
										</h3>
										<div className="flex gap-2">
											<button
												onClick={selectAllTests}
												className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10">
												Select All
											</button>
											<button
												onClick={clearAllTests}
												className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10">
												Clear All
											</button>
										</div>
									</div>
									<div className="space-y-1 max-h-[400px] overflow-y-auto">
										{dataset.testCases.map((tc) => (
											<label
												key={tc.id}
												className={cn(
													"flex items-center gap-2 p-2 rounded cursor-pointer",
													selectedTests.has(tc.id)
														? "bg-primary/20"
														: "hover:bg-white/5"
												)}>
												<input
													type="checkbox"
													checked={selectedTests.has(
														tc.id
													)}
													onChange={() =>
														toggleTest(tc.id)
													}
													className="rounded"
												/>
												<span className="text-xs font-mono">
													{tc.id}
												</span>
												<span
													className={cn(
														"text-[10px] px-1 rounded",
														tc.category ===
															"tool_usage"
															? "bg-purple-500/20 text-purple-400"
															: "bg-blue-500/20 text-blue-400"
													)}>
													{tc.category ===
													"tool_usage"
														? "🔧"
														: "✍️"}
												</span>
											</label>
										))}
									</div>
								</div>
							</div>
							<div className="p-4 border-t border-white/10 flex justify-between">
								<p className="text-xs text-muted-foreground">
									{selectedTests.size === 0
										? "All tests"
										: `${selectedTests.size} tests`}{" "}
									× {selectedModels.size} models ={" "}
									{(selectedTests.size ||
										dataset.testCases.length) *
										selectedModels.size}{" "}
									runs
								</p>
								<button
									onClick={startSelectedBenchmark}
									disabled={
										starting || selectedModels.size === 0
									}
									className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
									{starting ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Play className="h-4 w-4" />
									)}
									Start Selected
								</button>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Detail Modal */}
			<AnimatePresence>
				{detailModalOpen && selectedResult && (
					<ResultDetailModal
						result={selectedResult}
						onClose={() => setDetailModalOpen(false)}
						onSubmitScore={submitAdminScore}
					/>
				)}
			</AnimatePresence>
		</div>
	);
}

function ResultDetailModal({
	result,
	onClose,
	onSubmitScore,
}: {
	result: BenchmarkResult;
	onClose: () => void;
	onSubmitScore: (id: string, score: number, reasoning: string) => void;
}) {
	const [score, setScore] = useState<number>(result.adminScore ?? 5);
	const [reasoning, setReasoning] = useState(result.adminReasoning ?? "");
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async () => {
		setSubmitting(true);
		await onSubmitScore(result.id, score, reasoning);
		setSubmitting(false);
	};

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
			onClick={onClose}>
			<motion.div
				initial={{ scale: 0.95, y: 20 }}
				animate={{ scale: 1, y: 0 }}
				exit={{ scale: 0.95, y: 20 }}
				className="bg-background border border-white/10 rounded-xl max-w-5xl w-full max-h-[95vh] overflow-hidden"
				onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-white/10">
					<div>
						<h2 className="font-semibold">
							{result.testCaseId} — {result.modelId.split("/")[1]}
						</h2>
						<p className="text-xs text-muted-foreground">
							{result.category === "TOOL_USAGE"
								? "🔧 Tool Usage"
								: "✍️ Writing Quality"}
						</p>
					</div>
					<button
						onClick={onClose}
						className="p-2 hover:bg-white/10 rounded-lg">
						<X className="h-5 w-5" />
					</button>
				</div>

				{/* Content */}
				<div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
					{/* Metrics Row */}
					<div className="flex gap-4 text-sm">
						<div className="flex-1 p-3 bg-white/5 rounded-lg text-center">
							<div className="text-2xl font-bold">
								{result.overallScore.toFixed(1)}
							</div>
							<div className="text-[10px] text-muted-foreground">
								AI Score
							</div>
						</div>
						<div className="flex-1 p-3 bg-white/5 rounded-lg text-center">
							<div className="text-2xl font-bold">
								{result.adminScore?.toFixed(1) ?? "—"}
							</div>
							<div className="text-[10px] text-muted-foreground">
								Admin Score
							</div>
						</div>
						<div className="flex-1 p-3 bg-primary/10 rounded-lg text-center">
							<div className="text-2xl font-bold text-primary">
								{result.finalScore?.toFixed(1) ??
									result.overallScore.toFixed(1)}
							</div>
							<div className="text-[10px] text-muted-foreground">
								Final Score
							</div>
						</div>
						<div className="flex-1 p-3 bg-white/5 rounded-lg text-center">
							<div className="text-lg font-mono">
								{result.inferenceTimeMs}ms
							</div>
							<div className="text-[10px] text-muted-foreground">
								Time
							</div>
						</div>
						<div className="flex-1 p-3 bg-white/5 rounded-lg text-center">
							<div className="text-lg font-mono text-emerald-400">
								${result.costUsd.toFixed(5)}
							</div>
							<div className="text-[10px] text-muted-foreground">
								Cost
							</div>
						</div>
					</div>

					{/* User Prompt from dataset */}
					{(() => {
						const testCase = dataset.testCases.find(
							(tc) => tc.id === result.testCaseId
						);
						return testCase ? (
							<>
								<div>
									<h3 className="text-sm font-medium mb-2 flex items-center gap-2">
										<User className="h-4 w-4 text-emerald-400" />
										User Prompt
									</h3>
									<div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
										<p className="text-sm whitespace-pre-wrap">
											{testCase.userMessage}
										</p>
									</div>
								</div>

								{/* Context: Memories and Session */}
								<div className="grid grid-cols-2 gap-4">
									{/* Memories */}
									<div>
										<h3 className="text-sm font-medium mb-2 flex items-center gap-2">
											🧠 Memorie (
											{(
												testCase as {
													setup?: {
														memories?: Array<{
															key: string;
															value: string;
														}>;
													};
												}
											).setup?.memories?.length || 0}
											)
										</h3>
										<div className="p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20 max-h-32 overflow-y-auto">
											{(
												testCase as {
													setup?: {
														memories?: Array<{
															key: string;
															value: string;
														}>;
													};
												}
											).setup?.memories?.length ? (
												<ul className="text-xs space-y-1">
													{(
														testCase as {
															setup: {
																memories: Array<{
																	key: string;
																	value: string;
																}>;
															};
														}
													).setup.memories.map(
														(m, i) => (
															<li
																key={i}
																className="flex gap-2">
																<span className="font-mono text-cyan-400">
																	{m.key}:
																</span>
																<span className="text-muted-foreground">
																	{m.value}
																</span>
															</li>
														)
													)}
												</ul>
											) : (
												<p className="text-xs text-muted-foreground">
													Nessuna memoria
												</p>
											)}
										</div>
									</div>

									{/* Session / User Context */}
									<div>
										<h3 className="text-sm font-medium mb-2 flex items-center gap-2">
											👤 Profilo Utente
										</h3>
										<div className="p-3 bg-pink-500/10 rounded-lg border border-pink-500/20">
											{(
												testCase as {
													setup?: {
														userContext?: {
															profile?: Record<
																string,
																string
															>;
															preferences?: Record<
																string,
																string
															>;
														};
													};
												}
											).setup?.userContext?.profile ? (
												<ul className="text-xs space-y-1">
													{Object.entries(
														(
															testCase as {
																setup: {
																	userContext: {
																		profile: Record<
																			string,
																			string
																		>;
																	};
																};
															}
														).setup.userContext
															.profile
													).map(([k, v]) => (
														<li
															key={k}
															className="flex gap-2">
															<span className="font-mono text-pink-400">
																{k}:
															</span>
															<span className="text-muted-foreground">
																{v || "—"}
															</span>
														</li>
													))}
												</ul>
											) : (
												<p className="text-xs text-muted-foreground">
													Nessun profilo
												</p>
											)}
										</div>
									</div>
								</div>

								{/* Session history */}
								{(
									testCase as {
										setup?: {
											session?: Array<{
												role: string;
												content: string;
											}>;
										};
									}
								).setup?.session?.length ? (
									<div>
										<h3 className="text-sm font-medium mb-2 flex items-center gap-2">
											💬 Sessione (
											{
												(
													testCase as {
														setup: {
															session: unknown[];
														};
													}
												).setup.session.length
											}{" "}
											msg)
										</h3>
										<div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20 max-h-40 overflow-y-auto">
											<div className="text-xs space-y-2">
												{(
													testCase as {
														setup: {
															session: Array<{
																role: string;
																content: string;
															}>;
														};
													}
												).setup.session.map(
													(msg, i) => (
														<div
															key={i}
															className={cn(
																"p-2 rounded",
																msg.role ===
																	"user"
																	? "bg-blue-500/20"
																	: "bg-white/5"
															)}>
															<span className="font-medium">
																{msg.role}:{" "}
															</span>
															<span className="text-muted-foreground">
																{msg.content}
															</span>
														</div>
													)
												)}
											</div>
										</div>
									</div>
								) : null}
							</>
						) : null;
					})()}

					{/* Tool Calls */}
					{result.toolCalls && result.toolCalls.length > 0 && (
						<div>
							<h3 className="text-sm font-medium mb-2 flex items-center gap-2">
								<Wrench className="h-4 w-4 text-purple-400" />
								Tool Calls ({result.toolCalls.length})
							</h3>
							<div className="space-y-2">
								{result.toolCalls.map((tc, i) => (
									<div
										key={i}
										className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
										<div className="font-mono text-sm text-purple-400 mb-1">
											{tc.name}
										</div>
										<pre className="text-xs text-muted-foreground overflow-x-auto">
											{JSON.stringify(tc.args, null, 2)}
										</pre>
										{Boolean(tc.result) && (
											<div className="mt-2 pt-2 border-t border-purple-500/20">
												<div className="text-[10px] text-muted-foreground mb-1">
													Result:
												</div>
												<pre className="text-xs text-muted-foreground overflow-x-auto">
													{JSON.stringify(
														tc.result,
														null,
														2
													)}
												</pre>
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					)}

					{/* AI Response */}
					<div>
						<h3 className="text-sm font-medium mb-2 flex items-center gap-2">
							<MessageSquare className="h-4 w-4 text-blue-400" />
							AI Response
						</h3>
						<div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
							<p className="text-sm whitespace-pre-wrap">
								{result.responseText}
							</p>
						</div>
					</div>

					{/* AI Judge Reasoning */}
					{(result.toolUsageReasoning ||
						result.writingQualityReasoning) && (
						<div>
							<h3 className="text-sm font-medium mb-2 flex items-center gap-2">
								<Star className="h-4 w-4 text-amber-400" />
								AI Judge Reasoning
							</h3>
							<div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
								<p className="text-sm">
									{result.toolUsageReasoning ||
										result.writingQualityReasoning}
								</p>
							</div>
						</div>
					)}

					{/* Admin Scoring */}
					<div className="p-4 bg-white/5 rounded-lg border border-white/10">
						<h3 className="text-sm font-medium mb-3 flex items-center gap-2">
							<Star className="h-4 w-4 text-primary" />
							Your Evaluation
						</h3>
						<div className="space-y-3">
							<div>
								<label className="text-xs text-muted-foreground">
									Score (0-10)
								</label>
								<div className="flex items-center gap-3 mt-1">
									<input
										type="range"
										min="0"
										max="10"
										step="0.5"
										value={score}
										onChange={(e) =>
											setScore(parseFloat(e.target.value))
										}
										className="flex-1"
									/>
									<span className="font-mono text-lg w-10">
										{score}
									</span>
								</div>
							</div>
							<div>
								<label className="text-xs text-muted-foreground">
									Reasoning
								</label>
								<textarea
									value={reasoning}
									onChange={(e) =>
										setReasoning(e.target.value)
									}
									placeholder="Why this score?"
									className="mt-1 w-full p-2 bg-black/20 rounded border border-white/10 text-sm resize-none"
									rows={2}
								/>
							</div>
							<div className="flex items-center justify-between">
								<p className="text-[10px] text-muted-foreground">
									Final = 0.6 × Admin + 0.4 × AI
								</p>
								<button
									onClick={handleSubmit}
									disabled={submitting}
									className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
									{submitting ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										"Save Score"
									)}
								</button>
							</div>
						</div>
					</div>
				</div>
			</motion.div>
		</motion.div>
	);
}

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
	const config = {
		PENDING: { color: "text-amber-500", bg: "bg-amber-500/10" },
		RUNNING: { color: "text-blue-500", bg: "bg-blue-500/10" },
		COMPLETED: { color: "text-emerald-500", bg: "bg-emerald-500/10" },
		FAILED: { color: "text-rose-500", bg: "bg-rose-500/10" },
	}[status] || { color: "text-muted-foreground", bg: "bg-muted" };

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full font-medium",
				config.color,
				config.bg,
				small ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5"
			)}>
			{status === "RUNNING" && (
				<Loader2 className="h-2 w-2 animate-spin mr-1" />
			)}
			{small ? status[0] : status}
		</span>
	);
}

function ScoreBadge({ score, large }: { score: number; large?: boolean }) {
	const color =
		score >= 8
			? "text-emerald-500 bg-emerald-500/10"
			: score >= 6
			? "text-amber-500 bg-amber-500/10"
			: "text-rose-500 bg-rose-500/10";

	return (
		<span
			className={cn(
				"font-bold rounded",
				color,
				large ? "text-sm px-2 py-1" : "text-xs px-1.5 py-0.5"
			)}>
			{score.toFixed(1)}
		</span>
	);
}
