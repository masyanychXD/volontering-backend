import express from "express";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { sessions, events, directions, user } from "../db/schema/index.js";

const router = express.Router();

// Overview counts for core entities
router.get("/overview", async (req, res) => {
    try {
        const [
            usersCount,
            coordinatorsCount,
            adminsCount,
            eventsCount,
            directionsCount,
            sessionsCount,
        ] = await Promise.all([
            db.select({ count: sql<number>`count(*)` }).from(user),
            db
                .select({ count: sql<number>`count(*)` })
                .from(user)
                .where(eq(user.role, "coordinator")),
            db
                .select({ count: sql<number>`count(*)` })
                .from(user)
                .where(eq(user.role, "admin")),
            db.select({ count: sql<number>`count(*)` }).from(events),
            db.select({ count: sql<number>`count(*)` }).from(directions),
            db.select({ count: sql<number>`count(*)` }).from(sessions),
        ]);

        res.status(200).json({
            data: {
                users: usersCount[0]?.count ?? 0,
                coordinators: coordinatorsCount[0]?.count ?? 0,
                admins: adminsCount[0]?.count ?? 0,
                events: eventsCount[0]?.count ?? 0,
                directions: directionsCount[0]?.count ?? 0,
                sessions: sessionsCount[0]?.count ?? 0,
            },
        });
    } catch (error) {
        console.error("GET /stats/overview error:", error);
        res.status(500).json({ error: "Failed to fetch overview stats" });
    }
});

// Latest activity summaries
router.get("/latest", async (req, res) => {
    try {
        const { limit = 5 } = req.query;
        const limitPerPage = Math.max(1, +limit);

        const [latestSessions, latestCoordinators] = await Promise.all([
            db
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
                .orderBy(desc(sessions.createdAt))
                .limit(limitPerPage),
            db
                .select()
                .from(user)
                .where(eq(user.role, "coordinator"))
                .orderBy(desc(user.createdAt))
                .limit(limitPerPage),
        ]);

        res.status(200).json({
            data: {
                latestSessions,
                latestCoordinators,
            },
        });
    } catch (error) {
        console.error("GET /stats/latest error:", error);
        res.status(500).json({ error: "Failed to fetch latest stats" });
    }
});

// Aggregates for charts
router.get("/charts", async (req, res) => {
    try {
        const [usersByRole, eventsByDirection, sessionsByEvent] =
            await Promise.all([
                db
                    .select({
                        role: user.role,
                        total: sql<number>`count(*)`,
                    })
                    .from(user)
                    .groupBy(user.role),
                db
                    .select({
                        directionId: directions.id,
                        directionName: directions.name,
                        totalEvents: sql<number>`count(${events.id})`,
                    })
                    .from(directions)
                    .leftJoin(events, eq(events.directionId, directions.id))
                    .groupBy(directions.id),
                db
                    .select({
                        eventId: events.id,
                        eventName: events.name,
                        totalSessions: sql<number>`count(${sessions.id})`,
                    })
                    .from(events)
                    .leftJoin(sessions, eq(sessions.eventId, events.id))
                    .groupBy(events.id),
            ]);

        res.status(200).json({
            data: {
                usersByRole,
                eventsByDirection,
                sessionsByEvent,
            },
        });
    } catch (error) {
        console.error("GET /stats/charts error:", error);
        res.status(500).json({ error: "Failed to fetch chart stats" });
    }
});

export default router;