import express from "express";
import { and, desc, eq, ilike, or, sql, getTableColumns } from "drizzle-orm";

import { db } from "../db/index.js";
import { directions, events, sessions, user, enrollments } from "../db/schema/index.js";

const router = express.Router();

// Get all directions with optional search and pagination
router.get("/", async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(directions.name, `%${search}%`),
                    ilike(directions.code, `%${search}%`)
                )
            );
        }

        const whereClause =
            filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(directions)
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const directionsList = await db
            .select({
                ...getTableColumns(directions),
                totalEvents: sql<number>`count(${events.id})`,
            })
            .from(directions)
            .leftJoin(events, eq(directions.id, events.directionId))
            .where(whereClause)
            .groupBy(directions.id)
            .orderBy(desc(directions.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: directionsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /directions error:", error);
        res.status(500).json({ error: "Failed to fetch directions" });
    }
});

router.post("/", async (req, res) => {
    try {
        const { code, name, description } = req.body;

        const [createdDirection] = await db
            .insert(directions)
            .values({ code, name, description })
            .returning({ id: directions.id });

        if (!createdDirection) throw Error;

        res.status(201).json({ data: createdDirection });
    } catch (error) {
        console.error("POST /directions error:", error);
        res.status(500).json({ error: "Failed to create direction" });
    }
});

// Get direction details with counts
router.get("/:id", async (req, res) => {
    try {
        const directionId = Number(req.params.id);

        if (!Number.isFinite(directionId)) {
            return res.status(400).json({ error: "Invalid direction id" });
        }

        const [direction] = await db
            .select()
            .from(directions)
            .where(eq(directions.id, directionId));

        if (!direction) {
            return res.status(404).json({ error: "Direction not found" });
        }

        const [eventsCount, sessionsCount, volunteersCount] = await Promise.all([
            db
                .select({ count: sql<number>`count(*)` })
                .from(events)
                .where(eq(events.directionId, directionId)),
            db
                .select({ count: sql<number>`count(${sessions.id})` })
                .from(sessions)
                .leftJoin(events, eq(sessions.eventId, events.id))
                .where(eq(events.directionId, directionId)),
            db
                .select({ count: sql<number>`count(distinct ${user.id})` })
                .from(user)
                .leftJoin(enrollments, eq(user.id, enrollments.volunteerId))
                .leftJoin(sessions, eq(enrollments.sessionId, sessions.id))
                .leftJoin(events, eq(sessions.eventId, events.id))
                .where(
                    and(
                        eq(user.role, "student"),
                        eq(events.directionId, directionId)
                    )
                ),
        ]);

        res.status(200).json({
            data: {
                direction,
                totals: {
                    events: eventsCount[0]?.count ?? 0,
                    sessions: sessionsCount[0]?.count ?? 0,
                    enrolledVolunteers: volunteersCount[0]?.count ?? 0,
                },
            },
        });
    } catch (error) {
        console.error("GET /directions/:id error:", error);
        res.status(500).json({ error: "Failed to fetch direction details" });
    }
});

// List events in a direction with pagination
router.get("/:id/events", async (req, res) => {
    try {
        const directionId = Number(req.params.id);
        const { page = 1, limit = 10 } = req.query;

        if (!Number.isFinite(directionId)) {
            return res.status(400).json({ error: "Invalid direction id" });
        }

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(events)
            .where(eq(events.directionId, directionId));

        const totalCount = countResult[0]?.count ?? 0;

        const eventsList = await db
            .select({
                ...getTableColumns(events),
            })
            .from(events)
            .where(eq(events.directionId, directionId))
            .orderBy(desc(events.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: eventsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /directions/:id/events error:", error);
        res.status(500).json({ error: "Failed to fetch direction events" });
    }
});

// List sessions in a direction with pagination
router.get("/:id/sessions", async (req, res) => {
    try {
        const directionId = Number(req.params.id);
        const { page = 1, limit = 10 } = req.query;

        if (!Number.isFinite(directionId)) {
            return res.status(400).json({ error: "Invalid direction id" });
        }

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const countResult = await db
            .select({ count: sql<number>`count(${sessions.id})` })
            .from(sessions)
            .leftJoin(events, eq(sessions.eventId, events.id))
            .where(eq(events.directionId, directionId));

        const totalCount = countResult[0]?.count ?? 0;

        const sessionsList = await db
            .select({
                ...getTableColumns(sessions),
                event: {
                    ...getTableColumns(events),
                },
                coordinator: {
                    ...getTableColumns(user),
                },
            })
            .from(sessions)
            .leftJoin(events, eq(sessions.eventId, events.id))
            .leftJoin(user, eq(sessions.coordinatorId, user.id))
            .where(eq(events.directionId, directionId))
            .orderBy(desc(sessions.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: sessionsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /directions/:id/sessions error:", error);
        res.status(500).json({ error: "Failed to fetch direction sessions" });
    }
});

// List users in a direction by role with pagination
router.get("/:id/users", async (req, res) => {
    try {
        const directionId = Number(req.params.id);
        const { role, page = 1, limit = 10 } = req.query;

        if (!Number.isFinite(directionId)) {
            return res.status(400).json({ error: "Invalid direction id" });
        }

        if (role !== "coordinator" && role !== "student") {
            return res.status(400).json({ error: "Invalid role" });
        }

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const baseSelect = {
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            image: user.image,
            role: user.role,
            imageCldPubId: user.imageCldPubId,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };

        const groupByFields = [
            user.id, user.name, user.email, user.emailVerified,
            user.image, user.role, user.imageCldPubId,
            user.createdAt, user.updatedAt,
        ];

        const countResult = role === "coordinator"
            ? await db
                .select({ count: sql<number>`count(distinct ${user.id})` })
                .from(user)
                .leftJoin(sessions, eq(user.id, sessions.coordinatorId))
                .leftJoin(events, eq(sessions.eventId, events.id))
                .where(and(eq(user.role, role), eq(events.directionId, directionId)))
            : await db
                .select({ count: sql<number>`count(distinct ${user.id})` })
                .from(user)
                .leftJoin(enrollments, eq(user.id, enrollments.volunteerId))
                .leftJoin(sessions, eq(enrollments.sessionId, sessions.id))
                .leftJoin(events, eq(sessions.eventId, events.id))
                .where(and(eq(user.role, role), eq(events.directionId, directionId)));

        const totalCount = countResult[0]?.count ?? 0;

        const usersList = role === "coordinator"
            ? await db
                .select(baseSelect)
                .from(user)
                .leftJoin(sessions, eq(user.id, sessions.coordinatorId))
                .leftJoin(events, eq(sessions.eventId, events.id))
                .where(and(eq(user.role, role), eq(events.directionId, directionId)))
                .groupBy(...groupByFields)
                .orderBy(desc(user.createdAt))
                .limit(limitPerPage)
                .offset(offset)
            : await db
                .select(baseSelect)
                .from(user)
                .leftJoin(enrollments, eq(user.id, enrollments.volunteerId))
                .leftJoin(sessions, eq(enrollments.sessionId, sessions.id))
                .leftJoin(events, eq(sessions.eventId, events.id))
                .where(and(eq(user.role, role), eq(events.directionId, directionId)))
                .groupBy(...groupByFields)
                .orderBy(desc(user.createdAt))
                .limit(limitPerPage)
                .offset(offset);

        res.status(200).json({
            data: usersList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /directions/:id/users error:", error);
        res.status(500).json({ error: "Failed to fetch direction users" });
    }
});

export default router;