import {
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    varchar,
    index,
} from "drizzle-orm/pg-core";
import {relations} from "drizzle-orm";
import {user} from "./auth";

export const sessionStatusEnum = pgEnum('session_status', ['open', 'full', 'closed', 'cancelled']);

const timestamps = {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull()
}

export const directions = pgTable('directions', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    code: varchar('code', {length: 50}).notNull().unique(),
    name: varchar('name', {length: 255}).notNull(),
    description: text('description'),
    ...timestamps,
});

export const events = pgTable('events', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    directionId: integer('direction_id').notNull().references(() => directions.id, { onDelete: 'restrict' }),
    name: varchar('name', {length: 255}).notNull(),
    code: varchar('code', {length: 50}).notNull().unique(),
    description: text('description'),
    ...timestamps,
});

export const sessions = pgTable('sessions', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    coordinatorId: text('coordinator_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
    inviteCode: varchar('invite_code', {length: 50}).notNull().unique(),
    name: varchar('name', {length: 255}).notNull(),
    bannerCldPubId: text('banner_cld_pub_id'),
    bannerUrl: text('banner_url'),
    capacity: integer('capacity').notNull().default(50),
    description: text('description'),
    status: sessionStatusEnum('status').notNull().default('open'),
    schedules: jsonb('schedules').$type<Schedule[]>().notNull(),
    ...timestamps
}, (table) => [
    index('sessions_event_id_idx').on(table.eventId),
    index('sessions_coordinator_id_idx').on(table.coordinatorId),
]);

export const enrollments = pgTable('enrollments', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    volunteerId: text('volunteer_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    sessionId: integer('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    ...timestamps,
}, (table) => [
    index('enrollments_volunteer_id_idx').on(table.volunteerId),
    index('enrollments_session_id_idx').on(table.sessionId),
    index('enrollments_volunteer_session_unique').on(table.volunteerId, table.sessionId),
]);

export const directionsRelations = relations(directions, ({ many }) => ({
    events: many(events)
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
    direction: one(directions, {
        fields: [events.directionId],
        references: [directions.id],
    }),
    sessions: many(sessions)
}));

export const appSessionsRelations = relations(sessions, ({ one, many }) => ({
    event: one(events, {
        fields: [sessions.eventId],
        references: [events.id],
    }),
    coordinator: one(user, {
        fields: [sessions.coordinatorId],
        references: [user.id],
    }),
    enrollments: many(enrollments)
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
    volunteer: one(user, {
        fields: [enrollments.volunteerId],
        references: [user.id],
    }),
    session: one(sessions, {
        fields: [enrollments.sessionId],
        references: [sessions.id],
    }),
}));

export type Direction = typeof directions.$inferSelect;
export type NewDirection = typeof directions.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type AppSession = typeof sessions.$inferSelect;
export type AppNewSession = typeof sessions.$inferInsert;

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;