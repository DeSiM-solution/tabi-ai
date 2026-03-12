-- CreateTable
CREATE TABLE "UtmTracking" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtmTracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UtmTracking_sessionId_key" ON "UtmTracking"("sessionId");

-- CreateIndex
CREATE INDEX "UtmTracking_utmSource_utmCampaign_createdAt_idx" ON "UtmTracking"("utmSource", "utmCampaign", "createdAt" DESC);
