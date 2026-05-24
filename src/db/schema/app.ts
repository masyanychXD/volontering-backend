import {integer, pgTable, timestamp, varchar} from "drizzle-orm/pg-core";
import {relations} from "drizzle-orm";

const timestamps = {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('created_at').defaultNow().$onUpdate(()=>new Date()).notNull()
}

export const directions = pgTable('directions', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    code: varchar('code', {length: 50}).notNull().unique(),
    name: varchar('name', {length: 255}).notNull(),
    description: varchar('description', {length: 255}),
    ...timestamps,
});

export const events = pgTable('events', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    directionID: integer('direction_id').notNull().references(()=>directions.id, { onDelete: 'restrict' }),
    name: varchar('name', {length: 255}).notNull(),
    code: varchar('code', {length: 50}).notNull().unique(),
    description: varchar('description', {length: 255}),
    ...timestamps,
});

export const directionsRelations = relations(directions, ({ many })=> ({ events: many(events) }))

export const eventsRelations = relations(events, ({ one, many }) => ({
    directions: one(directions, {
        fields: [events.directionID],
        references: [directions.id],
    })
}));

export type Direction = typeof directions.$inferSelect;
export type NewDirection = typeof directions.$inferInsert;

export type Event = typeof directions.$inferSelect;
export type NewEvent = typeof directions.$inferInsert;