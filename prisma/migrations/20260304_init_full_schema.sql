-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionToolName" AS ENUM ('parse_youtube_input', 'crawl_youtube_videos', 'build_travel_blocks', 'resolve_spot_coordinates', 'search_image', 'generate_image', 'generate_handbook_html');

-- CreateEnum
CREATE TYPE "SessionStepStatus" AS ENUM ('RUNNING', 'SUCCESS', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HandbookLifecycleStatus" AS ENUM ('DRAFT', 'ARCHIVED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "activeHandbookId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Untitled Guide',
    "description" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'IDLE',
    "currentStep" "SessionToolName",
    "failedStep" "SessionToolName",
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handbook" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled Handbook',
    "html" TEXT NOT NULL,
    "lifecycle" "HandbookLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "sourceContext" JSONB,
    "sourceBlocks" JSONB,
    "sourceSpotBlocks" JSONB,
    "sourceToolOutputs" JSONB,
    "previewPath" TEXT,
    "style" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "image" TEXT,
    "googleId" TEXT,
    "githubId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "MessageRole" NOT NULL,
    "text" TEXT,
    "parts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionStep" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "toolName" "SessionToolName" NOT NULL,
    "status" "SessionStepStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionState" (
    "sessionId" TEXT NOT NULL,
    "context" JSONB,
    "blocks" JSONB,
    "spotBlocks" JSONB,
    "toolOutputs" JSONB,
    "handbookHtml" TEXT,
    "handbookVersion" INTEGER NOT NULL DEFAULT 0,
    "handbookGeneratedAt" TIMESTAMP(3),
    "previewPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionState_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "Session_userId_updatedAt_idx" ON "Session"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Session_activeHandbookId_idx" ON "Session"("activeHandbookId");

-- CreateIndex
CREATE INDEX "Session_status_updatedAt_idx" ON "Session"("status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Session_updatedAt_idx" ON "Session"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Handbook_sessionId_updatedAt_idx" ON "Handbook"("sessionId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Handbook_sessionId_lifecycle_updatedAt_idx" ON "Handbook"("sessionId", "lifecycle", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Handbook_lifecycle_publishedAt_idx" ON "Handbook"("lifecycle", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_seq_idx" ON "ChatMessage"("sessionId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_sessionId_externalId_key" ON "ChatMessage"("sessionId", "externalId");

-- CreateIndex
CREATE INDEX "SessionStep_sessionId_createdAt_idx" ON "SessionStep"("sessionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SessionStep_sessionId_toolName_createdAt_idx" ON "SessionStep"("sessionId", "toolName", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeHandbookId_fkey" FOREIGN KEY ("activeHandbookId") REFERENCES "Handbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handbook" ADD CONSTRAINT "Handbook_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStep" ADD CONSTRAINT "SessionStep_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionState" ADD CONSTRAINT "SessionState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

