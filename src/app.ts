import express from "express";
import cors from "cors";
import jobsRouter from "./routes/jobs.route";

const app = express();


const ORIGIN = process.env.ORIGIN || "*";
app.use(cors({ origin: ORIGIN }));

app.use(express.json());


app.use("/api/jobs", jobsRouter);


app.get("/", (_, res) => res.status(200).send("ok"));


app.get("/api/health", (_, res) => res.json({ status: "ok" }));

export default app;
