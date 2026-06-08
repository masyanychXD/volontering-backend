import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { directions, events, sessions, user, enrollments } from "../db/schema/index.js";

const router = express.Router();

// Get all events with optional search, direction filter, and pagination
router.get("/", async (req, res) => {
    try {
        const { search, direction, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(events.name, `%${search}%`),
                    ilike(events.code, `%${search}%`)
                )
            );
        }

        if (direction) {
            filterConditions.push(ilike(directions.name, `%${direction}%`));
        }

        const whereClause =
            filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(events)
            .leftJoin(directions, eq(events.directionId, directions.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const eventsList = await db
            .select({
                ...getTableColumns(events),
                direction: {
                    ...getTableColumns(directions),
                },
            })
            .from(events)
            .leftJoin(directions, eq(events.directionId, directions.id))
            .where(whereClause)
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
        console.error("GET /events error:", error);
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

// Get event details with counts
router.get("/:id", async (req, res) => {
    try {
        const eventId = Number(req.params.id);

        if (!Number.isFinite(eventId)) {
            return res.status(400).json({ error: "Invalid event id" });
        }

        const [event] = await db
            .select({
                ...getTableColumns(events),
                direction: {
                    ...getTableColumns(directions),
                },
            })
            .from(events)
            .leftJoin(directions, eq(events.directionId, directions.id))
            .where(eq(events.id, eventId));

        if (!event) {
            return res.status(404).json({ error: "Event not found" });
        }

        const [sessionsCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(sessions)
            .where(eq(sessions.eventId, eventId));

        res.status(200).json({
            data: {
                event,
                totals: {
                    sessions: sessionsCount?.count ?? 0,
                },
            },
        });
    } catch (error) {
        console.error("GET /events/:id error:", error);
        res.status(500).json({ error: "Failed to fetch event details" });
    }
});

// List sessions in an event with pagination
router.get("/:id/sessions", async (req, res) => {
    try {
        const eventId = Number(req.params.id);
        const { page = 1, limit = 10 } = req.query;

        if (!Number.isFinite(eventId)) {
            return res.status(400).json({ error: "Invalid event id" });
        }

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(sessions)
            .where(eq(sessions.eventId, eventId));

        const totalCount = countResult[0]?.count ?? 0;

        const sessionsList = await db
            .select({
                ...getTableColumns(sessions),
                coordinator: {
                    ...getTableColumns(user),
                },
            })
            .from(sessions)
            .leftJoin(user, eq(sessions.coordinatorId, user.id))
            .where(eq(sessions.eventId, eventId))
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
        console.error("GET /events/:id/sessions error:", error);
        res.status(500).json({ error: "Failed to fetch event sessions" });
    }
});

// List users in an event by role with pagination
router.get("/:id/users", async (req, res) => {
    try {
        const eventId = Number(req.params.id);
        const { role, page = 1, limit = 10 } = req.query;

        if (!Number.isFinite(eventId)) {
            return res.status(400).json({ error: "Invalid event id" });
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
            user.id,
            user.name,
            user.email,
            user.emailVerified,
            user.image,
            user.role,
            user.imageCldPubId,
            user.createdAt,
            user.updatedAt,
        ];

        const countResult = role === "coordinator"
            ? await db
                .select({ count: sql<number>`count(distinct ${user.id})` })
                .from(user)
                .leftJoin(sessions, eq(user.id, sessions.coordinatorId))
                .where(and(eq(user.role, role), eq(sessions.eventId, eventId)))
            : await db
                .select({ count: sql<number>`count(distinct ${user.id})` })
                .from(user)
                .leftJoin(enrollments, eq(user.id, enrollments.volunteerId))
                .leftJoin(sessions, eq(enrollments.sessionId, sessions.id))
                .where(and(eq(user.role, role), eq(sessions.eventId, eventId)));

        const totalCount = countResult[0]?.count ?? 0;

        const usersList = role === "coordinator"
            ? await db
                .select(baseSelect)
                .from(user)
                .leftJoin(sessions, eq(user.id, sessions.coordinatorId))
                .where(and(eq(user.role, role), eq(sessions.eventId, eventId)))
                .groupBy(...groupByFields)
                .orderBy(desc(user.createdAt))
                .limit(limitPerPage)
                .offset(offset)
            : await db
                .select(baseSelect)
                .from(user)
                .leftJoin(enrollments, eq(user.id, enrollments.volunteerId))
                .leftJoin(sessions, eq(enrollments.sessionId, sessions.id))
                .where(and(eq(user.role, role), eq(sessions.eventId, eventId)))
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
        console.error("GET /events/:id/users error:", error);
        res.status(500).json({ error: "Failed to fetch event users" });
    }
});

export default router;