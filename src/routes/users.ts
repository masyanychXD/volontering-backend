import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { db } from "../db";
import { enrollments, sessions, events, user, directions } from "../db/schema";
import {auth} from "../lib/auth";

const router = express.Router();

// Get all users with optional search, role filter, and pagination
router.get("/", async (req, res) => {
    try {
        const { search, role, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(user.name, `%${search}%`),
                    ilike(user.email, `%${search}%`)
                )
            );
        }

        if (role) {
            filterConditions.push(eq(user.role, role as UserRoles));
        }

        const whereClause =
            filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const usersList = await db
            .select()
            .from(user)
            .where(whereClause)
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
        console.error("GET /users error:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// Get user details
router.get("/:id", async (req, res) => {
    try {
        const userId = req.params.id;

        const [userRecord] = await db
            .select()
            .from(user)
            .where(eq(user.id, userId));

        if (!userRecord) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: userRecord });
    } catch (error) {
        console.error("GET /users/:id error:", error);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// Update user profile
router.put("/:id", async (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, image, imageCldPubId } = req.body;

        const [existingUser] = await db
            .select()
            .from(user)
            .where(eq(user.id, userId));

        if (!existingUser) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if email is being changed and if it's already taken
        if (email && email !== existingUser.email) {
            const [emailTaken] = await db
                .select({ id: user.id })
                .from(user)
                .where(eq(user.email, email));

            if (emailTaken) {
                return res.status(409).json({ error: "Email already in use" });
            }
        }

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (image !== undefined) updateData.image = image;
        if (imageCldPubId !== undefined) updateData.imageCldPubId = imageCldPubId;

        const [updatedUser] = await db
            .update(user)
            .set(updateData)
            .where(eq(user.id, userId))
            .returning();

        res.status(200).json({ data: updatedUser });
    } catch (error) {
        console.error("PUT /users/:id error:", error);
        res.status(500).json({ error: "Failed to update user" });
    }
});

// List sessions associated with a user
router.get("/:id/sessions", async (req, res) => {
    try {
        const userId = req.params.id;
        const { page = 1, limit = 10 } = req.query;

        const [userRecord] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, userId));

        if (!userRecord) {
            return res.status(404).json({ error: "User not found" });
        }

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        // Coordinators see sessions they created, volunteers see sessions they enrolled in
        const isCoordinator = userRecord.role === "coordinator" || userRecord.role === "admin";

        const countResult = isCoordinator
            ? await db
                .select({ count: sql<number>`count(distinct ${sessions.id})` })
                .from(sessions)
                .where(eq(sessions.coordinatorId, userId))
            : await db
                .select({ count: sql<number>`count(distinct ${sessions.id})` })
                .from(sessions)
                .leftJoin(enrollments, eq(sessions.id, enrollments.sessionId))
                .where(eq(enrollments.volunteerId, userId));

        const totalCount = countResult[0]?.count ?? 0;

        const sessionsList = isCoordinator
            ? await db
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
                .where(eq(sessions.coordinatorId, userId))
                .orderBy(desc(sessions.createdAt))
                .limit(limitPerPage)
                .offset(offset)
            : await db
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
                .leftJoin(enrollments, eq(sessions.id, enrollments.sessionId))
                .leftJoin(events, eq(sessions.eventId, events.id))
                .leftJoin(user, eq(sessions.coordinatorId, user.id))
                .where(eq(enrollments.volunteerId, userId))
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
        console.error("GET /users/:id/sessions error:", error);
        res.status(500).json({ error: "Failed to fetch user sessions" });
    }
});

// List directions associated with a user
router.get("/:id/directions", async (req, res) => {
    try {
        const userId = req.params.id;
        const { page = 1, limit = 10 } = req.query;

        const [userRecord] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, userId));

        if (!userRecord) {
            return res.status(404).json({ error: "User not found" });
        }

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const isCoordinator = userRecord.role === "coordinator" || userRecord.role === "admin";

        const countResult = isCoordinator
            ? await db
                .select({ count: sql<number>`count(distinct ${directions.id})` })
                .from(directions)
                .leftJoin(events, eq(events.directionId, directions.id))
                .leftJoin(sessions, eq(sessions.eventId, events.id))
                .where(eq(sessions.coordinatorId, userId))
            : await db
                .select({ count: sql<number>`count(distinct ${directions.id})` })
                .from(directions)
                .leftJoin(events, eq(events.directionId, directions.id))
                .leftJoin(sessions, eq(sessions.eventId, events.id))
                .leftJoin(enrollments, eq(enrollments.sessionId, sessions.id))
                .where(eq(enrollments.volunteerId, userId));

        const totalCount = countResult[0]?.count ?? 0;

        const directionsList = isCoordinator
            ? await db
                .select({ ...getTableColumns(directions) })
                .from(directions)
                .leftJoin(events, eq(events.directionId, directions.id))
                .leftJoin(sessions, eq(sessions.eventId, events.id))
                .where(eq(sessions.coordinatorId, userId))
                .groupBy(directions.id)
                .orderBy(desc(directions.createdAt))
                .limit(limitPerPage)
                .offset(offset)
            : await db
                .select({ ...getTableColumns(directions) })
                .from(directions)
                .leftJoin(events, eq(events.directionId, directions.id))
                .leftJoin(sessions, eq(sessions.eventId, events.id))
                .leftJoin(enrollments, eq(enrollments.sessionId, sessions.id))
                .where(eq(enrollments.volunteerId, userId))
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
        console.error("GET /users/:id/directions error:", error);
        res.status(500).json({ error: "Failed to fetch user directions" });
    }
});

// List events associated with a user
router.get("/:id/events", async (req, res) => {
    try {
        const userId = req.params.id;
        const { page = 1, limit = 10 } = req.query;

        const [userRecord] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, userId));

        if (!userRecord) {
            return res.status(404).json({ error: "User not found" });
        }

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);
        const offset = (currentPage - 1) * limitPerPage;

        const isCoordinator = userRecord.role === "coordinator" || userRecord.role === "admin";

        const countResult = isCoordinator
            ? await db
                .select({ count: sql<number>`count(distinct ${events.id})` })
                .from(events)
                .leftJoin(sessions, eq(sessions.eventId, events.id))
                .where(eq(sessions.coordinatorId, userId))
            : await db
                .select({ count: sql<number>`count(distinct ${events.id})` })
                .from(events)
                .leftJoin(sessions, eq(sessions.eventId, events.id))
                .leftJoin(enrollments, eq(enrollments.sessionId, sessions.id))
                .where(eq(enrollments.volunteerId, userId));

        const totalCount = countResult[0]?.count ?? 0;

        const eventsList = isCoordinator
            ? await db
                .select({
                    ...getTableColumns(events),
                    direction: { ...getTableColumns(directions) },
                })
                .from(events)
                .leftJoin(directions, eq(events.directionId, directions.id))
                .leftJoin(sessions, eq(sessions.eventId, events.id))
                .where(eq(sessions.coordinatorId, userId))
                .groupBy(events.id, directions.id)
                .orderBy(desc(events.createdAt))
                .limit(limitPerPage)
                .offset(offset)
            : await db
                .select({
                    ...getTableColumns(events),
                    direction: { ...getTableColumns(directions) },
                })
                .from(events)
                .leftJoin(directions, eq(events.directionId, directions.id))
                .leftJoin(sessions, eq(sessions.eventId, events.id))
                .leftJoin(enrollments, eq(enrollments.sessionId, sessions.id))
                .where(eq(enrollments.volunteerId, userId))
                .groupBy(events.id, directions.id)
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
        console.error("GET /users/:id/events error:", error);
        res.status(500).json({ error: "Failed to fetch user events" });
    }
});

// Get current authenticated user
router.get("/me", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        // Получаем сессию из Better Auth
        const session = await auth.api.getSession({
            headers: req.headers,
        });

        if (!session?.user) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const [userRecord] = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                image: user.image,
                imageCldPubId: user.imageCldPubId,
            })
            .from(user)
            .where(eq(user.id, session.user.id));

        if (!userRecord) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: userRecord });
    } catch (error) {
        console.error("GET /users/me error:", error);
        res.status(500).json({ error: "Failed to get current user" });
    }
});

export default router;