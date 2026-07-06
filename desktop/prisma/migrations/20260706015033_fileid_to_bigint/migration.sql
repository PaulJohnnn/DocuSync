-- CreateTable
CREATE TABLE "LocalVault" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "event_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL,
    "fileId" BIGINT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "logicalTimestamp" INTEGER NOT NULL,
    "vectorClockJson" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCompacted" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "conflict" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conflictId" TEXT NOT NULL,
    "fileId" BIGINT NOT NULL,
    "eventIdA" TEXT NOT NULL,
    "nodeIdA" TEXT NOT NULL,
    "vectorClockJsonA" TEXT NOT NULL,
    "payloadA" TEXT NOT NULL,
    "eventIdB" TEXT NOT NULL,
    "nodeIdB" TEXT NOT NULL,
    "vectorClockJsonB" TEXT NOT NULL,
    "payloadB" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "winner" TEXT,
    "resolvedBy" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "peer_registry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nodeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalVault_nodeId_key" ON "LocalVault"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "event_log_eventId_key" ON "event_log"("eventId");

-- CreateIndex
CREATE INDEX "event_log_fileId_logicalTimestamp_idx" ON "event_log"("fileId", "logicalTimestamp");

-- CreateIndex
CREATE INDEX "event_log_fileId_isCompacted_idx" ON "event_log"("fileId", "isCompacted");

-- CreateIndex
CREATE UNIQUE INDEX "conflict_conflictId_key" ON "conflict"("conflictId");

-- CreateIndex
CREATE INDEX "conflict_fileId_status_idx" ON "conflict"("fileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "peer_registry_nodeId_key" ON "peer_registry"("nodeId");

-- CreateIndex
CREATE INDEX "peer_registry_isOnline_idx" ON "peer_registry"("isOnline");
