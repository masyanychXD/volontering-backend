import express from 'express';
import cors from "cors";

import eventsRouter from "./routes/events";
import securityMiddleware from "./middleware/security";

const app = express();
const PORT = 8000;

app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}))

app.use(express.json());

app.use(securityMiddleware);

app.use('/api/events', eventsRouter);

app.get('/', (req, res) => {
   res.send("Hello, welcome to volonteering API!");
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
})