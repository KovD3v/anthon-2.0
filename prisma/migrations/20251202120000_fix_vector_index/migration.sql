-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop the existing btree index on embedding (if exists)
DROP INDEX IF EXISTS "RagChunk_embedding_idx";

-- Alter the embedding column to use native vector type
-- First add a new vector column
ALTER TABLE "RagChunk"
    ADD COLUMN IF NOT EXISTS embedding_vec vector(4096);

-- Copy data from Float[] to vector (if there's existing data)
UPDATE
    "RagChunk"
SET
    embedding_vec = embedding::vector(4096)
WHERE
    embedding IS NOT NULL
    AND array_length(embedding, 1) = 4096;

-- Drop the old column and rename new one
ALTER TABLE "RagChunk"
    DROP COLUMN IF EXISTS embedding;

ALTER TABLE "RagChunk" RENAME COLUMN embedding_vec TO embedding;

-- Note: For 4096 dimensions, we skip the index as HNSW only supports up to 2000 dimensions
-- and IVFFlat requires training data. The queries will still work using sequential scan.
-- For production with many documents, consider using a smaller embedding model or
-- dimensionality reduction techniques.
