-- Enable pgvector extension for Neon PostgreSQL
-- This enables vector similarity search capabilities
-- Enable the vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Convert the embedding column from Float[] to vector(4096)
-- Qwen3-embedding-8b outputs 4096-dimensional embeddings
ALTER TABLE "RagChunk"
    ALTER COLUMN "embedding" TYPE vector(4096)
    USING embedding::vector(4096);

-- Create an IVFFlat index for faster similarity search
-- This index uses cosine distance (<=>)
CREATE INDEX IF NOT EXISTS "RagChunk_embedding_idx" ON "RagChunk" USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- Add comment for documentation
COMMENT ON INDEX "RagChunk_embedding_idx" IS 'IVFFlat index for vector similarity search using cosine distance';

