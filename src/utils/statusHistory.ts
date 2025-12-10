import { Prisma, ApplicationStatus } from "@prisma/client";



//==========The recoder of issues=========//
export async function recordStatusHistory(
  tx: Prisma.TransactionClient,
  params: {
    applicationId: number;
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    changedById: number;
    reason?: string | null;
  }
) {
  const { applicationId, fromStatus, toStatus, changedById, reason } = params;
  return tx.statusHistory.create({
    data: {
      applicationId,
      fromStatus: fromStatus ?? undefined,
      toStatus,
      changedById,
      reason,
    },
  });
};
