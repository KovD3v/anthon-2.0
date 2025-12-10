-- Migration: Optimize Vector Index
-- Ensure 1536d vector column and add HNSW index for performance

-- 1. Ensure the vector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Ensure embedding column is 1536 dimensions (matching openai/text-embedding-3-small)
DO $$
DECLARE
    curr_dim integer;
    col_exists boolean;
BEGIN
    -- Check if column exists
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'RagChunk'
        AND column_name = 'embedding'
    ) INTO col_exists;

    IF col_exists THEN
        -- Check dimensions of existing data (if any)
        -- We handle the case where the column might not be a vector type yet (though unlikely) by casting to vector in query if needed,
        -- but vector_dims expects vector. If the column is already vector, this works.
        BEGIN
            SELECT vector_dims(embedding) INTO curr_dim
            FROM "RagChunk"
            WHERE embedding IS NOT NULL
            LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
            -- If we can't get dims (e.g. invalid type), assume it needs clearing
            curr_dim := -1;
        END;

        -- If we have data and it's not 1536d, we must clear it because it's incompatible with the new model.
        -- If curr_dim is NULL, it means no data or all NULLs, so we are safe.
        IF curr_dim IS NOT NULL AND curr_dim != 1536 THEN
            RAISE NOTICE 'Detected vector dimensions % (expected 1536). Clearing incompatible embeddings.', curr_dim;
            UPDATE "RagChunk" SET embedding = NULL;
        END IF;

        -- Now safely alter the type to vector(1536)
        ALTER TABLE "RagChunk" ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536);
    ELSE
        -- Column does not exist, create it
        ALTER TABLE "RagChunk" ADD COLUMN embedding vector(1536);
    END IF;
END $$;

-- 3. Create HNSW index for fast similarity search
-- Drop existing index if it exists (e.g. from previous attempts or different name)
DROP INDEX IF EXISTS "RagChunk_embedding_idx";
-- Create new HNSW index
CREATE INDEX IF NOT EXISTS "RagChunk_embedding_idx"
ON "RagChunk"
USING hnsw (embedding vector_cosine_ops);

-- 4. Comment
COMMENT ON COLUMN "RagChunk".embedding IS 'Vector embedding using openai/text-embedding-3-small (1536 dimensions)';
