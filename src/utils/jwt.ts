import jwt, { SignOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET in environment variables.");
const SECRET: string = JWT_SECRET;
const RAW_EXPIRES = process.env.JWT_EXPIRES_IN ?? "7d";

export interface JwtPayload { sub: number; role: Role }

function signToken(userId: number, role: Role): string {
  const payload: JwtPayload = { sub: userId, role };
  return jwt.sign(
    payload,
    SECRET,                                 
    { expiresIn: RAW_EXPIRES as SignOptions["expiresIn"]}
  );
}

export default signToken;
