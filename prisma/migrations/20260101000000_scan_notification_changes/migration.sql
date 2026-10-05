-- Clean up existing Scan rows: keep only the latest scan per project
DELETE FROM "Scan" WHERE "id" NOT IN (
  SELECT "id" FROM "Scan" s 
  WHERE s."startedAt" = (
    SELECT MAX("startedAt") FROM "Scan" WHERE "projectId" = s."projectId"
  )
  GROUP BY "projectId"
);

-- Create unique constraint on Scan.projectId
CREATE UNIQUE INDEX "Scan_projectId_key" ON "Scan"("projectId");

-- Drop the old non-unique index on Scan.projectId (if exists)
DROP INDEX IF EXISTS "Scan_projectId_idx";

-- Clean up NotificationLog: keep only the most recent 50 per project
DELETE FROM "NotificationLog" WHERE "id" NOT IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" DESC) as rn
    FROM "NotificationLog"
  ) WHERE rn <= 50
);