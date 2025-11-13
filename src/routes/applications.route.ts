import { Router, Request, Response, NextFunction } from "express";
import {
  PrismaClient,
  Prisma,
  ApplicationStatus,
  Role,
} from "@prisma/client";

import { z } from "zod";
import { auth, requireRole } from "../middleware/auth";
import { recordStatusHistory } from "../utils/statusHistory";

const prisma = new PrismaClient();
const router = Router();

function parseStatus(q?: string): ApplicationStatus | undefined {
  if (!q) return undefined;
  if ((Object.values(ApplicationStatus) as string[]).includes(q)) {
    return q as ApplicationStatus;
  }
  return undefined;
}

const applySchema = z.object({
  jobId: z.number().int().positive(),
  reason: z.string().max(1000).optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  assigneeId: z.number().int().positive().optional(),
  reason: z.string().max(1000).optional(),
});


router.post("/", auth, requireRole("CANDIDATE"), async (req, res, next) => {
  try {
    const user = (req as any).user as { id: number; role: Role };
    const body = applySchema.parse(req.body);

    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
    });
    if (!candidate) {
      return res
        .status(400)
        .json({ error: "NO_CANDIDATE_PROFILE", message: "请先完善候选人资料" });
    }

    const job = await prisma.jOB.findUnique({ where: { id: body.jobId } });
    if (!job) return res.status(404).json({ error: "JOB_NOT_FOUND" });

    const app = await prisma.$transaction(async (tx) => {
      const created = await tx.application.create({
        data: {
          jobId: body.jobId,
          candidateId: candidate.id,
          applicantUserId: user.id,
          status: ApplicationStatus.APPLIED,
          reason: body.reason,
        },
        include: {
          job: true,
          candidate: true,
        },
      });

      await recordStatusHistory(tx, {
        applicationId: created.id,
        fromStatus: null,
        toStatus: ApplicationStatus.APPLIED,
        changedById: user.id,
        reason: body.reason,
      });

      return created;
    });

    return res.status(201).json(app);
  } catch (e) {
    next(e);
  }
});


async function getMyApplications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as { id: number; role: Role };

    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
    });
    if (!candidate) {
      return res.status(400).json({ error: "NO_CANDIDATE_PROFILE" });
    }

    const apps = await prisma.application.findMany({
      where: { candidateId: candidate.id },
      include: {
        job: true,
        assignee: true,
        candidate: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(apps);
  } catch (e) {
    next(e);
  }
}


router.get("/me", auth, requireRole("CANDIDATE"), getMyApplications);
router.get("/mine", auth, requireRole("CANDIDATE"), getMyApplications);


router.get("/hr", auth, requireRole("HR"), async (req, res, next) => {
  try {
    const status = parseStatus(req.query.status as string | undefined);

    const where: Prisma.ApplicationWhereInput = {};
    if (status) where.status = status;

    const apps = await prisma.application.findMany({
      where,
      include: {
        job: true,
        candidate: true,
        assignee: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(apps);
  } catch (e) {
    next(e);
  }
});



router.get("/lead", auth, requireRole("LEAD"), async (req, res, next) => {
  try {
    const status = parseStatus(req.query.status as string | undefined);

    const where: Prisma.ApplicationWhereInput = {};
    if (status) where.status = status;

    const apps = await prisma.application.findMany({
      where,
      include: {
        job: true,
        candidate: true,
        assignee: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(apps);
  } catch (e) {
    next(e);
  }
});



router.patch(
  "/:id/status",
  auth,
  requireRole("HR", "LEAD"),
  async (req, res, next) => {
    try {
      const user = (req as any).user as { id: number; role: Role };
      const id = Number(req.params.id);
      const body = updateStatusSchema.parse(req.body);

      const app = await prisma.application.findUnique({
        where: { id },
        include: {
          job: { include: { jobOwner: true } },
        },
      });
      if (!app) return res.status(404).json({ error: "NOT_FOUND" });

      
      if (user.role === "HR") {
        if (!app.job.jobOwner || app.job.jobOwner.ownerId !== user.id) {
          return res.status(403).json({ error: "FORBIDDEN" });
        }
      } 
      
      // else if (user.role === "LEAD") {
        
      //   if (app.assigneeId !== user.id) {
      //     return res.status(403).json({ error: "FORBIDDEN" });
      //   }
      // }

      let assigneeId = app.assigneeId;
      
      if (
        user.role === "HR" &&
        body.status === ApplicationStatus.INTERVIEW &&
        body.assigneeId
      ) {
        assigneeId = body.assigneeId;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.application.update({
          where: { id: app.id },
          data: {
            status: body.status,
            reason: body.reason ?? app.reason,
            assigneeId,
          },
          include: {
            job: true,
            candidate: true,
            assignee: true,
          },
        });

        await recordStatusHistory(tx, {
          applicationId: u.id,
          fromStatus: app.status,
          toStatus: body.status,
          changedById: user.id,
          reason: body.reason,
        });

        return u;
      });

      return res.json(updated);
    } catch (e) {
      next(e);
    }
  }
);

export default router;
