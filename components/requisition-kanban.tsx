"use client";

import type { ApplicationStage, Role } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { transitionApplication } from "@/app/actions";
import { SlaChip, StageBadge, TimeInStage } from "@/components/ui";

type KanbanApplication = {
  id: string;
  candidateId: string;
  stage: ApplicationStage;
  stageEnteredAt: string;
  candidate: { fullName: string; location: string };
};

const columns: ApplicationStage[] = [
  "MATCHED",
  "RECRUITER_SCREEN",
  "HM_REVIEW",
  "INTERVIEWING",
  "DECISION",
  "OFFER_DRAFT",
  "OFFER_PAYROLL_APPROVAL",
  "OFFER_SENT",
];

function legalTarget(role: Role, stage: ApplicationStage): ApplicationStage | null {
  if (role === "RECRUITER" && stage === "MATCHED") return "RECRUITER_SCREEN";
  if (role === "RECRUITER" && stage === "RECRUITER_SCREEN") return "HM_REVIEW";
  if (role === "HIRING_MANAGER" && stage === "HM_REVIEW") return "INTERVIEWING";
  return null;
}

export function RequisitionKanban({
  role,
  requisitionCode,
  applications,
}: {
  role: Role;
  requisitionCode: string;
  applications: KanbanApplication[];
}) {
  const router = useRouter();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function advance(application: KanbanApplication, target: ApplicationStage) {
    const formData = new FormData();
    formData.set("applicationId", application.id);
    formData.set("candidateId", application.candidateId);
    formData.set("target", target);
    formData.set("reason", `Advanced from ${requisitionCode} kanban.`);
    startTransition(async () => {
      await transitionApplication(formData);
      setDraggedId(null);
      router.refresh();
    });
  }

  return (
    <div className={`flex gap-4 overflow-x-auto p-4 scrollbar-thin ${pending ? "opacity-70" : ""}`}>
      {columns.map((stage) => {
        const stageApplications = applications.filter((item) => item.stage === stage);
        const dragged = applications.find((item) => item.id === draggedId);
        const acceptsDrop = dragged ? legalTarget(role, dragged.stage) === stage : false;
        return (
          <div
            key={stage}
            onDragOver={(event) => {
              if (acceptsDrop) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged && acceptsDrop) advance(dragged, stage);
            }}
            className={`w-72 shrink-0 rounded-xl p-3 transition ${acceptsDrop ? "bg-blue-100 ring-2 ring-blue-400" : "bg-slate-100"}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <StageBadge stage={stage} />
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{stageApplications.length}</span>
            </div>
            <div className="space-y-3">
              {stageApplications.map((application) => {
                const target = legalTarget(role, application.stage);
                const enteredAt = new Date(application.stageEnteredAt);
                return (
                  <article
                    key={application.id}
                    draggable={Boolean(target) && !pending}
                    onDragStart={() => setDraggedId(application.id)}
                    onDragEnd={() => setDraggedId(null)}
                    className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${target ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <Link href={`/candidates/${application.candidateId}`} className="font-semibold text-slate-900 hover:text-blue-700">{application.candidate.fullName}</Link>
                    <div className="mt-1 text-xs text-slate-500">{application.candidate.location}</div>
                    <div className="mt-3 flex items-center justify-between"><SlaChip enteredAt={enteredAt} /><TimeInStage enteredAt={enteredAt} /></div>
                    {target && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => advance(application, target)}
                        className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Advance to {target.replaceAll("_", " ")}
                      </button>
                    )}
                  </article>
                );
              })}
              {stageApplications.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">
                  {acceptsDrop ? "Drop to advance" : "No candidates"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
