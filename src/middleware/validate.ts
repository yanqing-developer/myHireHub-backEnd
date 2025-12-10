import {z} from "zod";
import {Request, Response, NextFunction} from "express";


//====This is to avoid frontend from sending unpredictable data======//
export const validate = (schema:z.ZodType<any>)=>
  (req:Request,res:Response,next:NextFunction)=>{
    const result = schema.safeParse(req.body);
    if (!result.success) {
     
      return res.status(400).json({ error: "BAD_REQUEST", details: result.error.issues });
    }
    req.body = result.data;
    return next();
  };

export default validate;