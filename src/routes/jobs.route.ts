// src/routes/jobs.route.ts
import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth, requireRole } from "../middleware/auth";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();
const router = Router();


function parsePaging(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function parseSort(sort?: string) {
  if (!sort) return { createdAt: "desc" as const };
  const [field, dir] = String(sort).split(":");
  const direction = dir?.toLowerCase() === "asc" ? "asc" : "desc";
  return { [field as string]: direction };
}

async function assertCanEditJob(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const user = (req as any).user as {
    id: number;
    role: "HR" | "LEAD" | "CANDIDATE";
  };

  if (!user) return next({ status: 401, error: "UNAUTHORIZED" });

  const jobId = Number(req.params.id);

  // LEAD update all
  if (user.role === "LEAD") return next();

  // HR update what he made
  const ownership = await prisma.jobOwner.findUnique({ where: { jobId } });
  if (!ownership || ownership.ownerId !== user.id) {
    return next({ status: 403, error: "FORBIDDEN" });
  }

  return next();
}


const createJobSchema = z.object({
  externalId: z.string().optional(),
  title: z.string().min(2, "Title too short"),
  company: z.string().min(1, "Company is required"),
  location: z.string().min(1, "Location is required"),
  type: z.string().optional(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  postedAt: z.coerce.date().optional(),
  source: z.string().optional(),
  rawJson: z.any().optional(),
});

const updateJobSchema = createJobSchema.partial();


router.get("/", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = parsePaging(req);
    const { search, company, location, type, sort } =
      req.query as Record<string, string | undefined>;

    const filters: Prisma.JOBWhereInput[] = [];

    if (company) {
      filters.push({
        company: { contains: company, mode: "insensitive" },
      });
    }

    if (location) {
      filters.push({
        location: { contains: location, mode: "insensitive" },
      });
    }

    if (type) {
      filters.push({
        type: { contains: type, mode: "insensitive" },
      });
    }

    if (search) {
      filters.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
          { location: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.JOBWhereInput =
      filters.length > 0 ? { AND: filters } : {};

    const orderBy = parseSort(sort);

    const [data, total] = await Promise.all([
      prisma.jOB.findMany({ where, orderBy, skip, take }),
      prisma.jOB.count({ where }),
    ]);

    return res.json({
      data,
      page,
      pageSize,
      total,
      hasMore: skip + data.length < total,
    });
  } catch (e) {
    next(e);
  }
});


router.get("/mine", auth, async (req, res, next) => {
  try {
    const user = (req as any).user as {
      id: number;
      role: "HR" | "LEAD" | "CANDIDATE";
    };

    const { page, pageSize, skip, take } = parsePaging(req);
    const orderBy = parseSort(String(req.query.sort || "createdAt:desc"));

    if (user.role === "LEAD") {
      const [data, total] = await Promise.all([
        prisma.jOB.findMany({
          orderBy,
          skip,
          take,
          include: { jobOwner: true },
        }),
        prisma.jOB.count(),
      ]);
      return res.json({
        data,
        page,
        pageSize,
        total,
        hasMore: skip + data.length < total,
      });
    }

    if (user.role !== "HR") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const ownerships = await prisma.jobOwner.findMany({
      where: { ownerId: user.id },
      select: { jobId: true },
    });
    const jobIds = ownerships.map((o) => o.jobId);

    const [data, total] = await Promise.all([
      prisma.jOB.findMany({
        where: { id: { in: jobIds } },
        orderBy,
        skip,
        take,
        include: { jobOwner: true },
      }),
      prisma.jOB.count({ where: { id: { in: jobIds } } }),
    ]);

    return res.json({
      data,
      page,
      pageSize,
      total,
      hasMore: skip + data.length < total,
    });
  } catch (e) {
    next(e);
  }
});


router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const job = await prisma.jOB.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json(job);
  } catch (e) {
    next(e);
  }
});

// Create
router.post(
  "/",
  auth,
  requireRole("HR", "LEAD"),
  async (req, res, next) => {
    try {
      const body = createJobSchema.parse(req.body);
      const externalId = body.externalId ?? randomUUID();

      const job = await prisma.$transaction(async (tx) => {
        const created = await tx.jOB.create({
          data: {
            ...body,
            externalId,
          },
        });

        await tx.jobOwner.create({
          data: {
            jobId: created.id,
            ownerId: (req as any).user.id,
          },
        });

        return created;
      });

      return res.status(201).json(job);
    } catch (e) {
      next(e);
    }
  }
);

//Update
router.patch(
  "/:id",
  auth,
  requireRole("HR", "LEAD"),
  assertCanEditJob,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const data = updateJobSchema.parse(req.body);

      if ("externalId" in data) {
        delete (data as any).externalId;
      }

      const job = await prisma.jOB.update({
        where: { id },
        data,
      });

      return res.json(job);
    } catch (e) {
      next(e);
    }
  }
);

//Delete
router.delete(
  "/:id",
  auth,
  requireRole("HR", "LEAD"),
  assertCanEditJob,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      await prisma.jOB.delete({ where: { id } });
    } catch (e) {
      return next(e);
    }
    return res.status(204).send();
  }
);

export default router;
