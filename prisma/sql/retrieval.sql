-- Indexes Prisma cannot express, applied after every `db push`.
--
-- `Unsupported("vector(1024)")` gets the column created and nothing more —
-- Prisma has no way to describe an HNSW index, so without this file the table
-- exists and every similarity query falls back to a sequential scan over every
-- embedding the client owns. That is fast enough on a hundred rows and a
-- disaster on a hundred thousand, and the failure is silent: correct results,
-- quietly getting slower, which is the kind of thing nobody notices until it
-- is a support ticket.
--
-- Every statement is IF NOT EXISTS. This runs on every deploy.

CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW rather than IVFFlat.
--
-- IVFFlat needs a training pass over data that already exists to build its
-- lists, and its recall degrades as rows are inserted past the point it was
-- trained at. Embeddings here arrive continuously — a lead at a time, forever
-- — so a structure that needs periodic retraining to stay accurate is a
-- structure that will silently stop being accurate. HNSW builds incrementally
-- and holds its recall.
--
-- Cosine, because the embeddings are normalised and cosine is what the
-- provider's similarity is defined in. Mixing distance operators between the
-- index and the query means the index is simply not used.
CREATE INDEX IF NOT EXISTS embedding_hnsw_cosine
  ON "Embedding"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- The lexical half of hybrid search. GIN over the tsvector column, which is
-- written inline by the insert rather than maintained by a trigger — one fewer
-- piece of database state that can be out of step with the row.
CREATE INDEX IF NOT EXISTS embedding_tsv_gin
  ON "Embedding"
  USING gin (tsv);

-- The filter every single query carries. Without it, tenant scoping is a
-- sequential scan bolted onto an index scan.
CREATE INDEX IF NOT EXISTS embedding_client_model
  ON "Embedding" ("clientId", "model");
