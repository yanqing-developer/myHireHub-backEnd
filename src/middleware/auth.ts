import { Request,Response, NextFunction } from "express";
import jwt from "jsonwebtoken";


declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: number;
      role: "HR" | "LEAD" | "CANDIDATE";
    };
  }
}

export type JwtUser={sub:number,role:"HR"|"LEAD"|"CANDIDATE"};

export async function auth(req:Request,res:Response,next:NextFunction){
   const header=req.headers.authorization;    
    if(!header){
        return res.status(401).json({error:"UNAUTHORIZED"})
    }

    const parts=header.trim().split(/\s+/);
    if(parts.length !== 2) {
        return res.status(401).json({ error: "UNAUTHORIZED" })
    };

   const [scheme,token]=parts;
  
   if(scheme.toLowerCase()!=="bearer"||!token){
       return res.status(401).json({error:"UNAUTHORIZED"});
  }

  try {
    const payload=jwt.verify(token,process.env.JWT_SECRET!) as unknown as JwtUser;
    (req as any).user={id:payload.sub,role: payload.role};
    next();
  } catch (error) {
    return res.status(401).json({error:"UNAUTHORIZED"})
  }
}

export function requireRole(...roles:JwtUser["role"][]){
    
  return(req:Request,res:Response,next: NextFunction)=>{
        const user=(req as any).user as { id:number;role:JwtUser["role"] }|undefined;
        if (!user)return res.status(401).json({ error: "UNAUTHORIZED" });
        if (!roles.includes(user.role)) return res.status(403).json({ error:"FORBIDDEN" });
        next();}  
    };
 