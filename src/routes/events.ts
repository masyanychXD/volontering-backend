import express from "express";
import {and, desc, eq, getTableColumns, ilike, or, sql} from "drizzle-orm";
import {directions, events} from "../db/schema";
import { db } from "../db";

const router = express.Router();


router.get("/", async (req, res) => {
    try {
        const { search, direction, page = 1, limit = 10} = req.query;

        const currentPage = Math.max(1, +page);
        const limitPerPage = Math.max(1, +limit);

        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(events.name, `%${search}%`),
                    ilike(events.code, `%${search}%`),
                )
            );
        }

        if (direction) {
            filterConditions.push(ilike(directions.name, `%${direction}%`));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({count: sql<number>`count(*)`})
            .from(events)
            .leftJoin(directions, eq(events.directionID, directions.id))
            .where(whereClause)

        const totalCount = countResult[0]?.count ?? 0;

        const eventsList = await db.select({ ...getTableColumns(events), direction: {...getTableColumns(directions)}
        }).from(events).leftJoin(directions, eq(events.directionID, directions.id))
            .where(whereClause).
            orderBy(desc(events.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: eventsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });

    } catch (e) {
        console.error(`GET /events error: ${e}`);
        res.status(500).json({error: 'Failed to get events'});
    }
})

export default router;