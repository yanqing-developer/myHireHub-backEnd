import { Prisma } from "@prisma/client";
import { Request,Response,NextFunction } from "express";

export function errorHandler(err:any, _req:Request, res:Response, _next:NextFunction) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
  if (err.code==="P2002") return res.status(409).json({ error: "CONFLICT", meta: err.meta });
  }
  console.error("[ERROR]", err);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
};