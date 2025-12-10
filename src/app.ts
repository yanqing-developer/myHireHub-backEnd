import express from "express";
import cors from "cors";
import jobsRouter from "./routes/jobs.route";
import authRouter from "./routes/auth.route";
import applicationsRouter from "./routes/applications.route"
import meRouter from "./routes/me.route"; 

import { errorHandler } from "./middleware/error";

const app = express();

const allowedOrigins=process.env.ORIGIN
  ?process.env.ORIGIN.split(",").map(s => s.trim()).filter(Boolean)
  :[];

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {    
    if (!origin) return callback(null, true);    
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};


app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/jobs", jobsRouter);
app.use("/api/auth", authRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/me", meRouter); 
app.get("/api/health", (_, res) => res.json({ status: "ok" }));

app.use(errorHandler);

export default app;
