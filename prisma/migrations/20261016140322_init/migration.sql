-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RESIDENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'LOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('INVITE', 'RESET', 'ACTION');

-- CreateEnum
CREATE TYPE "SpotType" AS ENUM ('STANDARD', 'COMPACT', 'LARGE', 'EV', 'MOTORBIKE', 'ACCESSIBLE');

-- CreateEnum
CREATE TYPE "RuleKind" AS ENUM ('MANUAL', 'WEEKLY', 'WEEKENDS', 'ALWAYS');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'REQUESTED', 'CONFIRMED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('TENANT', 'OWNER', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NONE', 'METHOD_SAVED', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ProblemCategory" AS ENUM ('SPOT_OCCUPIED', 'OVERSTAY', 'DAMAGE', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "apartment" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RESIDENT',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "passwordHash" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notificationPrefs" JSONB NOT NULL DEFAULT '{}',
    "paymentAccountId" TEXT,
    "paymentOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "deletionRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "ipPrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" "TokenType" NOT NULL,
    "userId" UUID NOT NULL,
    "payload" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "lockLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ParkingSpot" (
    "id" UUID NOT NULL,
    "planNumber" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "SpotType" NOT NULL DEFAULT 'STANDARD',
    "ownerId" UUID,
    "pricePerHourCents" INTEGER NOT NULL DEFAULT 0,
    "pricePerDayCents" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "accessNotes" TEXT NOT NULL DEFAULT '',
    "instantBooking" BOOLEAN NOT NULL DEFAULT false,
    "instantMaxMinutes" INTEGER NOT NULL DEFAULT 240,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "tier1Minutes" INTEGER,
    "tier2Days" INTEGER,
    "tier3Months" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" UUID NOT NULL,
    "spotId" UUID NOT NULL,
    "kind" "RuleKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "weekdays" INTEGER[],
    "startMin" INTEGER,
    "endMin" INTEGER,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blocking" (
    "id" UUID NOT NULL,
    "spotId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blocking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "spotId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
    "priceCents" INTEGER NOT NULL,
    "visitorName" TEXT,
    "licensePlate" TEXT,
    "instant" BOOLEAN NOT NULL DEFAULT false,
    "extendsBookingId" UUID,
    "contractVersion" INTEGER,
    "contractAcceptedAt" TIMESTAMP(3),
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NONE',
    "paymentMethodType" TEXT,
    "paymentMethodRef" TEXT,
    "paymentRetryUntil" TIMESTAMP(3),
    "cancelledBy" "CancelledBy",
    "cancelReason" TEXT,
    "requestedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reminderStartSent" BOOLEAN NOT NULL DEFAULT false,
    "reminderEndSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "accountRef" TEXT,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL,
    "methodType" TEXT,
    "refundRef" TEXT,
    "refundedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCustomer" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "customerRef" TEXT NOT NULL,

    CONSTRAINT "PaymentCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "bodyDe" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "pdf" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalPage" (
    "key" TEXT NOT NULL,
    "bodyDe" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalPage_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "tier1Minutes" INTEGER NOT NULL DEFAULT 2880,
    "tier2Days" INTEGER NOT NULL DEFAULT 14,
    "tier3Months" INTEGER NOT NULL DEFAULT 1,
    "maxDurationValue" INTEGER NOT NULL DEFAULT 1,
    "maxDurationUnit" TEXT NOT NULL DEFAULT 'MONTH',
    "minLeadMinutes" INTEGER NOT NULL DEFAULT 0,
    "minDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "fairnessLimit" INTEGER NOT NULL DEFAULT 3,
    "openRequestLimit" INTEGER NOT NULL DEFAULT 5,
    "requestExpiryHours" INTEGER NOT NULL DEFAULT 48,
    "devClockOffsetMs" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaragePlan" (
    "id" UUID NOT NULL,
    "svg" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" UUID,

    CONSTRAINT "GaragePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemReport" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "category" "ProblemCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,

    CONSTRAINT "ProblemReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemPhoto" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ProblemPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevMail" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Token_tokenHash_key" ON "Token"("tokenHash");

-- CreateIndex
CREATE INDEX "Token_userId_type_idx" ON "Token"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingSpot_planNumber_key" ON "ParkingSpot"("planNumber");

-- CreateIndex
CREATE INDEX "AvailabilityRule_spotId_idx" ON "AvailabilityRule"("spotId");

-- CreateIndex
CREATE INDEX "Blocking_spotId_idx" ON "Blocking"("spotId");

-- CreateIndex
CREATE INDEX "Booking_spotId_status_idx" ON "Booking"("spotId", "status");

-- CreateIndex
CREATE INDEX "Booking_tenantId_status_idx" ON "Booking"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Booking_ownerId_status_idx" ON "Booking"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCustomer_userId_provider_accountRef_key" ON "PaymentCustomer"("userId", "provider", "accountRef");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_version_key" ON "ContractTemplate"("version");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_bookingId_locale_key" ON "Contract"("bookingId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSpot" ADD CONSTRAINT "ParkingSpot_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "ParkingSpot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blocking" ADD CONSTRAINT "Blocking_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "ParkingSpot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "ParkingSpot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCustomer" ADD CONSTRAINT "PaymentCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemPhoto" ADD CONSTRAINT "ProblemPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ProblemReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Custom constraints (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------

-- T-18: two confirmed bookings of the same spot must never overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap"
  EXCLUDE USING gist ("spotId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE (status = 'CONFIRMED');
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_valid_range" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_price_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "ParkingSpot" ADD CONSTRAINT "ParkingSpot_price_nonnegative"
  CHECK ("pricePerHourCents" >= 0 AND "pricePerDayCents" >= 0);

-- V-02: stored contracts are immutable.
CREATE OR REPLACE FUNCTION contract_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Contracts are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER contract_no_update BEFORE UPDATE OR DELETE ON "Contract"
  FOR EACH ROW EXECUTE FUNCTION contract_immutable();

-- A-08: audit log is append-only; only rows older than 2 years may be deleted.
CREATE OR REPLACE FUNCTION audit_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."at" < now() - interval '2 years' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Audit log is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();
