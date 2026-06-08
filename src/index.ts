import cors from "cors";
import express from "express";
import { toNodeHandler } from "better-auth/node";

import eventsRouter from "./routes/events";
import usersRouter from "./routes/users";
import sessionsRouter from "./routes/sessions";
import directionsRouter from "./routes/directions";
import enrollmentsRouter from "./routes/enrollments";
import statsRouter from "./routes/stats";
import securityMiddleware from "./middleware/security";
import { auth } from "./lib/auth";

const app = express();
const PORT = 8000;

app.use(
    cors({
        origin: process.env.FRONTEND_URL,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        credentials: true,
    })
);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

// app.use(securityMiddleware);

app.use("/api/events", eventsRouter);
app.use("/api/users", usersRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/directions", directionsRouter);
app.use("/api/enrollments", enrollmentsRouter);
app.use("/api/stats", statsRouter);

app.get("/", (req, res) => {
    res.send("Backend server is running!");
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});