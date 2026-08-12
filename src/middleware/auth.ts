import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: { userId: number; role: string };
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: number;
      role: string;
    };
    req.user = decoded;
    next();
  } catch (err) {
    console.error("JWT verify failed:", err); // TEMP debug log
    console.error("Token received:", token); // TEMP debug log
    console.error("JWT_SECRET length:", process.env.JWT_SECRET?.length); // TEMP debug log
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
