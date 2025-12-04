/*
  Warnings:

  - The `visibility` column on the `Chat` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `kind` on the `Artifact` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ChatVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('CODE', 'TEXT', 'SHEET', 'IMAGE');

-- AlterTable
ALTER TABLE "Artifact" DROP COLUMN "kind",
ADD COLUMN     "kind" "ArtifactKind" NOT NULL;

-- AlterTable
ALTER TABLE "Attachment" ALTER COLUMN "messageId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Chat" DROP COLUMN "visibility",
ADD COLUMN     "visibility" "ChatVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "ragChunksCount" INTEGER,
ADD COLUMN     "ragUsed" BOOLEAN;
