# Bolt's Journal

## 2024-05-22 - [Prisma Select Optimization]
**Learning:** Fetching large JSON/Text fields (like `parts`, `reasoningContent`) in `findMany` queries when only `role` and `content` are needed can significantly increase DB payload and memory usage, especially for lists of messages.
**Action:** Use `select` in Prisma queries to fetch only necessary fields when building context or listing items.

## 2024-05-22 - [Initial Check]
**Learning:** The `.jules` directory might not exist initially.
**Action:** Always check for directory existence or create it if needed.
