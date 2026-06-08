import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { db } from "../db";
import { events, sessions, user , enrollments} from "../db/schema";

const router = express.Router();

// Get all sessions with optional search, event, coordinator filters, and pagination
router.get("/", async (req, res) => {
    try {
        const { search, event, coordinator, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(sessions.name, `%${search}%`),
                    ilike(sessions.inviteCode, `%${search}%`)
                )
            );
        }

        if (event) {
            filterConditions.push(ilike(events.name, `%${event}%`));
        }

        if (coordinator) {
            filterConditions.push(ilike(user.name, `%${coordinator}%`));
        }

        const whereClause =
            filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(sessions)
            .leftJoin(events, eq(sessions.eventId, events.id))
            .leftJoin(user, eq(sessions.coordinatorId, user.id))
            .where(whereClause);

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
            .where(whereClause)
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
        console.error("GET /sessions error:", error);
        res.status(500).json({ error: "Failed to fetch sessions" });
    }
});

router.post("/", async (req, res) => {
    try {
        const {
            name,
            coordinatorId,
            eventId,
            capacity,
            description,
            status,
            bannerUrl,
            bannerCldPubId,
        } = req.body;

        // Маппинг русского статуса в английский
        let dbStatus: "open" | "full" | "closed" | "cancelled" = "open";

        if (status === "Открыто") dbStatus = "open";
        else if (status === "Закрыто") dbStatus = "closed";
        else if (status === "Заполнена") dbStatus = "full";
        else if (status === "Отменена") dbStatus = "cancelled";

        const [createdSession] = await db
            .insert(sessions)
            .values({
                eventId,
                inviteCode: Math.random().toString(36).substring(2, 9),
                name,
                coordinatorId,
                bannerCldPubId: bannerCldPubId || null,
                bannerUrl: bannerUrl || null,
                capacity,
                description,
                schedules: [],
                status: dbStatus,
            })
            .returning({ id: sessions.id });

        if (!createdSession) throw Error;

        res.status(201).json({ data: createdSession });
    } catch (error) {
        console.error("POST /sessions error:", error);
        res.status(500).json({ error: "Failed to create session" });
    }
});

// Get session details with counts
router.get("/:id", async (req, res) => {
    try {
        const sessionId = Number(req.params.id);

        if (!Number.isFinite(sessionId)) {
            return res.status(400).json({ error: "Invalid session id" });
        }

        const [sessionDetails] = await db
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
            .where(eq(sessions.id, sessionId));

        if (!sessionDetails) {
            return res.status(404).json({ error: "Session not found" });
        }

        // Маппинг статуса обратно в русский для фронтенда
        const statusMap: Record<string, string> = {
            "open": "Открыто",
            "full": "Заполнена",
            "closed": "Закрыто",
            "cancelled": "Отменена",
        };

        const responseData = {
            ...sessionDetails,
            status: statusMap[sessionDetails.status] || sessionDetails.status,
        };

        res.status(200).json({ data: responseData });
    } catch (error) {
        console.error("GET /sessions/:id error:", error);
        res.status(500).json({ error: "Failed to fetch session details" });
    }
});

// List volunteers in a session with pagination
router.get("/:id/volunteers", async (req, res) => {
    try {
        const sessionId = Number(req.params.id);
        const { page = 1, limit = 10 } = req.query;

        if (!Number.isFinite(sessionId)) {
            return res.status(400).json({ error: "Invalid session id" });
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

        const countResult = await db
            .select({ count: sql<number>`count(distinct ${user.id})` })
            .from(user)
            .leftJoin(enrollments, eq(user.id, enrollments.volunteerId))
            .where(eq(enrollments.sessionId, sessionId));

        const totalCount = countResult[0]?.count ?? 0;

        const volunteersList = await db
            .select(baseSelect)
            .from(user)
            .leftJoin(enrollments, eq(user.id, enrollments.volunteerId))
            .where(eq(enrollments.sessionId, sessionId))
            .groupBy(...groupByFields)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: volunteersList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /sessions/:id/volunteers error:", error);
        res.status(500).json({ error: "Failed to fetch session volunteers" });
    }
});

export default router;