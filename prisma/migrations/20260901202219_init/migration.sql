-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "headcountTarget" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "JobDescriptionTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "family" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "responsibilities" JSONB NOT NULL,
    "mustHave" JSONB NOT NULL,
    "niceToHave" JSONB NOT NULL,
    "compBandMin" INTEGER NOT NULL,
    "compBandMax" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "version" INTEGER NOT NULL,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    CONSTRAINT "JobDescriptionTemplate_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Requisition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "hiringManagerId" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "openedAt" DATETIME,
    "targetStartDate" DATETIME NOT NULL,
    "priority" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "openingsCount" INTEGER NOT NULL,
    CONSTRAINT "Requisition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Requisition_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Requisition_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Requisition_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobDescriptionTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL,
    "consentAt" DATETIME,
    "retentionUntil" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL,
    "parsedText" TEXT NOT NULL,
    "parsedSkills" JSONB NOT NULL,
    "parsedYearsExp" REAL NOT NULL,
    "parsedTitles" JSONB NOT NULL,
    "redFlags" JSONB NOT NULL,
    "aiConfidence" REAL NOT NULL,
    "validatedById" TEXT,
    "validatedAt" DATETIME,
    CONSTRAINT "Resume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Resume_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "requisitionId" TEXT,
    "stage" TEXT NOT NULL,
    "previousStage" TEXT,
    "stageEnteredAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    "matchScore" INTEGER,
    "matchRationale" TEXT,
    "matchSuggestions" JSONB,
    "decision" TEXT,
    "decisionById" TEXT,
    "decisionAt" DATETIME,
    "decisionReason" TEXT,
    CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Application_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_decisionById_fkey" FOREIGN KEY ("decisionById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Interview_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scorecard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "interviewId" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "competencyRatings" JSONB NOT NULL,
    "notes" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL,
    CONSTRAINT "Scorecard_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfferPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "bonusPct" REAL NOT NULL,
    "equity" INTEGER NOT NULL,
    "signOn" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "currency" TEXT NOT NULL,
    "withinBand" BOOLEAN NOT NULL,
    "justification" TEXT,
    "status" TEXT NOT NULL,
    "payrollReviewerId" TEXT,
    "payrollDecisionAt" DATETIME,
    "payrollComment" TEXT,
    CONSTRAINT "OfferPackage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OfferPackage_payrollReviewerId_fkey" FOREIGN KEY ("payrollReviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StageEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipOrJob" TEXT NOT NULL,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "stageFrom" TEXT NOT NULL,
    "stageTo" TEXT NOT NULL,
    "targetHours" INTEGER NOT NULL,
    "businessDaysOnly" BOOLEAN NOT NULL,
    "warnAtPct" INTEGER NOT NULL DEFAULT 75
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobName" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL,
    "itemsProcessed" INTEGER NOT NULL,
    "warnings" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "AIEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "precision" REAL NOT NULL,
    "recall" REAL NOT NULL,
    "humanOverrideRate" REAL NOT NULL,
    "avgLatencyMs" INTEGER NOT NULL,
    "estCostUsd" REAL NOT NULL,
    "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_code_key" ON "Requisition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_interviewId_key" ON "Scorecard"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferPackage_applicationId_key" ON "OfferPackage"("applicationId");
