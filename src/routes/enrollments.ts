import express from "express";
import { and, eq, getTableColumns } from "drizzle-orm";

import { db } from "../db";
import { sessions, events, directions, enrollments, user } from "../db/schema";

const router = express.Router();

const getEnrollmentDetails = async (enrollmentId: number) => {
    const [enrollment] = await db
        .select({
            ...getTableColumns(enrollments),
            session: {
                ...getTableColumns(sessions),
            },
            event: {
                ...getTableColumns(events),
            },
            direction: {
                ...getTableColumns(directions),
            },
            coordinator: {
                ...getTableColumns(user),
            },
        })
        .from(enrollments)
        .leftJoin(sessions, eq(enrollments.sessionId, sessions.id))
        .leftJoin(events, eq(sessions.eventId, events.id))
        .leftJoin(directions, eq(events.directionId, directions.id))
        .leftJoin(user, eq(sessions.coordinatorId, user.id))
        .where(eq(enrollments.id, enrollmentId));

    return enrollment;
};

// Create enrollment
router.post("/", async (req, res) => {
    try {
        const { sessionId, volunteerId } = req.body;

        if (!sessionId || !volunteerId) {
            return res
                .status(400)
                .json({ error: "sessionId and volunteerId are required" });
        }

        const [sessionRecord] = await db
            .select()
            .from(sessions)
            .where(eq(sessions.id, sessionId));

        if (!sessionRecord)
            return res.status(404).json({ error: "Session not found" });

        const [volunteer] = await db
            .select()
            .from(user)
            .where(eq(user.id, volunteerId));

        if (!volunteer)
            return res.status(404).json({ error: "Volunteer not found" });

        const [existingEnrollment] = await db
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(
                and(
                    eq(enrollments.sessionId, sessionId),
                    eq(enrollments.volunteerId, volunteerId)
                )
            );

        if (existingEnrollment)
            return res
                .status(409)
                .json({ error: "Volunteer already enrolled in this session" });

        const [createdEnrollment] = await db
            .insert(enrollments)
            .values({ sessionId, volunteerId })
            .returning({ id: enrollments.id });

        if (!createdEnrollment)
            return res.status(500).json({ error: "Failed to create enrollment" });

        const enrollment = await getEnrollmentDetails(createdEnrollment.id);

        res.status(201).json({ data: enrollment });
    } catch (error) {
        console.error("POST /enrollments error:", error);
        res.status(500).json({ error: "Failed to create enrollment" });
    }
});

// Join session by invite code
router.post("/join", async (req, res) => {
    try {
        const { inviteCode, volunteerId } = req.body;

        if (!inviteCode || !volunteerId) {
            return res
                .status(400)
                .json({ error: "inviteCode and volunteerId are required" });
        }

        const [sessionRecord] = await db
            .select()
            .from(sessions)
            .where(eq(sessions.inviteCode, inviteCode));

        if (!sessionRecord)
            return res.status(404).json({ error: "Session not found" });

        const [volunteer] = await db
            .select()
            .from(user)
            .where(eq(user.id, volunteerId));

        if (!volunteer)
            return res.status(404).json({ error: "Volunteer not found" });

        const [existingEnrollment] = await db
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(
                and(
                    eq(enrollments.sessionId, sessionRecord.id),
                    eq(enrollments.volunteerId, volunteerId)
                )
            );

        if (existingEnrollment)
            return res
                .status(409)
                .json({ error: "Volunteer already enrolled in this session" });

        const [createdEnrollment] = await db
            .insert(enrollments)
            .values({ sessionId: sessionRecord.id, volunteerId })
            .returning({ id: enrollments.id });

        if (!createdEnrollment)
            return res.status(500).json({ error: "Failed to join session" });

        const enrollment = await getEnrollmentDetails(createdEnrollment.id);

        res.status(201).json({ data: enrollment });
    } catch (error) {
        console.error("POST /enrollments/join error:", error);
        res.status(500).json({ error: "Failed to join session" });
    }
});

export default router;