-- Revert: Switch back from text-embedding-3-large (1536d) to Qwen (4096d)
-- This reverts the migration 20251207120000_switch_to_text_embedding_3_large

-- Step 1: Drop HNSW index (if exists)
DROP INDEX IF EXISTS ragchunk_embedding_hnsw_idx;

-- Step 2: Drop 1536d embedding column
ALTER TABLE "RagChunk" DROP COLUMN IF EXISTS embedding;

-- Step 3: Add back 4096d embedding column
ALTER TABLE "RagChunk" ADD COLUMN embedding vector(4096);

-- Step 4: Update comment
COMMENT ON COLUMN "RagChunk".embedding IS 'Vector embedding using qwen/qwen3-embedding-8b (4096 dimensions) via OpenRouter';

-- Note: Existing embeddings are preserved in the database
-- No re-embedding is needed as we're reverting to the original model
