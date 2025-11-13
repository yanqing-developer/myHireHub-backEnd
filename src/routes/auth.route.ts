import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import  validate  from "../middleware/validate"
import  {auth, requireRole } from "../middleware/auth";
import signToken from "../utils/jwt";

const prisma=new PrismaClient();
const router=Router();

const registerSchema=z.object({
  email:z.string().email(),
  password:z.string().min(6),
  name:z.string().optional(),
  photoUrl: z.string().url().optional(), 
  phone:z.string().optional(),
  resumeUrl:z.string().url().optional(),
  linkedinUrl:z.string().url().optional(),
  portfolioUrl:z.string().url().optional(),
});

router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const {
      email,
      password,
      name,
      photoUrl,
      phone,
      resumeUrl,
      linkedinUrl,
      portfolioUrl}=req.body;

    const passwordHash=await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data:{
        email,
        passwordHash,
        name,
        role:Role.CANDIDATE,
      photoUrl: photoUrl ?? null
     },
    });

    await prisma.candidate.create({
      data:{
        userId: user.id,
        fullName: name || "",
        email,
        phone,
        resumeUrl,
        linkedinUrl,
        portfolioUrl,
        photoUrl: photoUrl ?? null, 
      },
    });

    const token = signToken(user.id, user.role);
    return res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, photoUrl: user.photoUrl } });
  } catch (e) { next(e); }
});


const loginSchema=z.object({
  email:z.string().email(),
  password:z.string().min(6),
});

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const token = signToken(user.id, user.role);
    return res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, photoUrl: user.photoUrl } });
  } catch (e) { next(e); }
});


router.get("/me", auth, async (req, res, next) => {
  try {
    const me =req.user!;            
    const user = await prisma.user.findUnique({ where: { id: me.id } });
    if (!user) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) { next(e); }
});

export default router;
