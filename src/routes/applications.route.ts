import { Router } from "express";
import {
  PrismaClient,
  ApplicationStatus,
  Role,
} from "@prisma/client";
import { z } from "zod";
import { auth, requireRole } from "../middleware/auth";
import { recordStatusHistory } from "../utils/statusHistory";

const prisma = new PrismaClient();
const router = Router();



const applySchema = z.object({
  jobId: z.number().int().positive(),
  reason: z.string().max(1000).optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  reason: z.string().max(1000).optional(),
});


function isHrTransitionAllowed(from: ApplicationStatus, to: ApplicationStatus) {
  if (from !== "APPLIED" && from !== "SCREENING") return false;
  return (
    to === "SCREENING" ||
    to === "INTERVIEW" ||
    to === "REJECTED"
  );
}


function isLeadTransitionAllowed(from: ApplicationStatus, to: ApplicationStatus) {
  if (from !== "INTERVIEW") return false;
  return (
    to === "OFFER" ||
    to === "REJECTED" ||
    to === "SCREENING"
  );
}


router.post("/", auth, requireRole("CANDIDATE"), async (req, res) => {
  try {
    const parsed = applySchema.parse({
      jobId: Number(req.body.jobId),
      reason: req.body.reason,
    });

   
    const authUser = req.user!; 

 
    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
    });

    if (!dbUser) {
      return res.status(400).json({ message: "User not found" });
    }


    let candidate = await prisma.candidate.findUnique({
      where: { userId: dbUser.id },
    });


    if (!candidate) {
      const fallbackName =
        dbUser.name ||
        (dbUser.email ? dbUser.email.split("@")[0] : "Candidate");

      candidate = await prisma.candidate.create({
        data: {
          userId: dbUser.id,
          fullName: fallbackName,          
          email: dbUser.email,            
          photoUrl: dbUser.photoUrl ?? null,
        },
      });
    }

 
    const existing = await prisma.application.findFirst({
      where: {
        jobId: parsed.jobId,
        candidateId: candidate.id,
      },
    });

    if (existing) {
      return res.status(409).json({
        message: "You have already applied for this job.",
      });
    }


    const created = await prisma.application.create({
      data: {
        jobId: parsed.jobId,
        candidateId: candidate.id,
        applicantUserId: dbUser.id,           
        status: ApplicationStatus.APPLIED,
        reason: parsed.reason ?? null,
      },
    });

   
    await recordStatusHistory(prisma, {
      applicationId: created.id,
      fromStatus: null,
      toStatus: created.status,
      changedById: authUser.id,
      reason: parsed.reason ?? null,
    });

    return res.status(201).json(created);
  } catch (err: any) {
    console.error("POST /applications error", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Failed to create application" });
  }
});



router.get("/me", auth, requireRole("CANDIDATE"), async (req, res) => {
  try {
    const user = req.user!;

    const candidate = await prisma.candidate.findUnique({
      where: { userId: user.id },
    });

    if (!candidate) {
      return res.json([]);
    }

    const apps = await prisma.application.findMany({
      where: { candidateId: candidate.id },
      include: {
        job: {
          select: { id: true, title: true, company: true, location: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = apps.map((a) => ({
      id: a.id,
      status: a.status,
      createdAt: a.createdAt,
      job: a.job,
    }));

    return res.json(result);
  } catch (err) {
    console.error("GET /applications/me error", err);
    return res.status(500).json({ message: "Failed to load applications" });
  }
});


router.get("/hr", auth, requireRole("HR"), async (_req, res) => {
  try {
    const apps = await prisma.application.findMany({
      where: {
        status: {
          in: [ApplicationStatus.APPLIED, ApplicationStatus.SCREENING],
        },
      },
      include: {
        job: { select: { id: true, title: true } },
        candidate: {
          include: { user: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = apps.map((a) => ({
      id: a.id,
      status: a.status,
      createdAt: a.createdAt,
      job: a.job,
      candidate: {
        id: a.candidate.id,
        fullName: a.candidate.fullName,
        email: a.candidate.email,
        photoUrl: a.candidate.photoUrl || a.candidate.user?.photoUrl || null,
      },
    }));

    return res.json(result);
  } catch (err) {
    console.error("GET /applications/hr error", err);
    return res.status(500).json({ message: "Failed to load HR applications" });
  }
});

router.get("/lead", auth, requireRole("LEAD"), async (_req, res) => {
  try {
    const apps = await prisma.application.findMany({
      where: {
        status: ApplicationStatus.INTERVIEW,
      },
      include: {
        job: { select: { id: true, title: true } },
        candidate: {
          include: { user: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = apps.map((a) => ({
      id: a.id,
      status: a.status,
      createdAt: a.createdAt,
      job: a.job,
      candidate: {
        id: a.candidate.id,
        fullName: a.candidate.fullName,
        email: a.candidate.email,
        photoUrl: a.candidate.photoUrl || a.candidate.user?.photoUrl || null,
      },
    }));

    return res.json(result);
  } catch (err) {
    console.error("GET /applications/lead error", err);
    return res.status(500).json({ message: "Failed to load Lead applications" });
  }
});


router.patch(
  "/:id/status",
  auth,
  requireRole("HR", "LEAD"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Invalid application id" });
      }

      const parsed = updateStatusSchema.parse(req.body);
      const user = req.user!;
      const role = user.role as Role;

      const app = await prisma.application.findUnique({
        where: { id },
      });

      if (!app) {
        return res.status(404).json({ message: "Application not found" });
      }

      const from = app.status;
      const to = parsed.status;

      let allowed = false;
      if (role === "HR") {
        allowed = isHrTransitionAllowed(from, to);
      } else if (role === "LEAD") {
        allowed = isLeadTransitionAllowed(from, to);
      }

      if (!allowed) {
        return res.status(403).json({
          message: "This status transition is not allowed for your role.",
        });
      }

      const updated = await prisma.application.update({
        where: { id },
        data: {
          status: to,
        },
      });

      await recordStatusHistory(prisma, {
        applicationId: updated.id,
        fromStatus: from,
        toStatus: to,
        changedById: user.id,
        reason: parsed.reason ?? null,
      });

      return res.json(updated);
    } catch (err: any) {
      console.error("PATCH /applications/:id/status error", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({ message: "Failed to update status" });
    }
  }
);

export default router;
