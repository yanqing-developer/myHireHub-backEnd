import { Router } from "express";
import { PrismaClient, Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "../middleware/auth";

const prisma = new PrismaClient();
const router = Router();

router.get("/profile", auth, async (req, res, next) => {
  try {
    const userCtx = (req as any).user as { id: number; role: Role };

    const user = await prisma.user.findUnique({
      where: { id: userCtx.id },
      select: {
        id: true,
        email: true,
        name: true,
        photoUrl: true,
        role: true,
        createdAt: true,
        candidate: true, 
      },
    });

    if (!user) return res.status(404).json({ error: "NOT_FOUND" });

    return res.json(user);
  } catch (e) {
    next(e);
  }
});


const baseUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  photoUrl: z.string().url().optional(),
});

const candidateExtraSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional(),
  resumeUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),
  candidatePhotoUrl: z.string().url().optional(), 
});

router.patch("/profile", auth, async (req, res, next) => {
  try {
    const userCtx = (req as any).user as { id: number; role: Role };

    const base = baseUserSchema.parse(req.body);

    if (userCtx.role === "CANDIDATE") {
      const extra = candidateExtraSchema.parse(req.body);

      const [user, candidate] = await prisma.$transaction([
        prisma.user.update({
          where: { id: userCtx.id },
          data: {
            name: base.name,
            photoUrl: base.photoUrl,
          },
        }),
        prisma.candidate.update({
          where: { userId: userCtx.id },
          data: {
            fullName: extra.fullName,
            phone: extra.phone,
            resumeUrl: extra.resumeUrl,
            linkedinUrl: extra.linkedinUrl,
            portfolioUrl: extra.portfolioUrl,
            photoUrl: extra.candidatePhotoUrl ?? base.photoUrl,
          },
        }),
      ]);

      return res.json({ user, candidate });
    }


    const user = await prisma.user.update({
      where: { id: userCtx.id },
      data: {
        name: base.name,
        photoUrl: base.photoUrl,
      },
    });

    return res.json({ user });
  } catch (e) {
    next(e);
  }
});

export default router;
