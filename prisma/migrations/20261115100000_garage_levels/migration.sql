-- K-01: one plan per garage level. Older uploads were only kept as history; the newest one
-- becomes the single level "Tiefgarage".
DELETE FROM "GaragePlan"
WHERE "id" NOT IN (SELECT "id" FROM "GaragePlan" ORDER BY "uploadedAt" DESC, "id" LIMIT 1);

-- AlterTable
ALTER TABLE "GaragePlan" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Tiefgarage',
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GaragePlan" ALTER COLUMN "name" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "GaragePlan_name_key" ON "GaragePlan"("name");
