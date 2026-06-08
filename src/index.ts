import cors from "cors";
import express from "express";
import { toNodeHandler } from "better-auth/node";

import eventsRouter from "./routes/events.js";
import usersRouter from "./routes/users.js";
import sessionsRouter from "./routes/sessions.js";
import directionsRouter from "./routes/directions.js";
import enrollmentsRouter from "./routes/enrollments.js";
import statsRouter from "./routes/stats.js";
// import securityMiddleware from "./middleware/security.js";
import { auth } from "./lib/auth.js";

const app = express();
const PORT = 8000;

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
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