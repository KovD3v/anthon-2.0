-- Remove the legacy admin/API benchmark tables. The canonical model-evaluation
-- path now writes reality benchmark JSON/Markdown reports under docs/benchmarks/runs.
DROP TABLE IF EXISTS "BenchmarkResult";
DROP TABLE IF EXISTS "BenchmarkRun";
DROP TABLE IF EXISTS "BenchmarkTestCase";

DROP TYPE IF EXISTS "BenchmarkCategory";
DROP TYPE IF EXISTS "BenchmarkStatus";
