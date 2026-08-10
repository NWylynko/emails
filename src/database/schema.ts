import { foreignKey, index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

export const emails = pgTable(
  "emails",
  (t) => ({
    emailId: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    from: t.varchar({ length: 256 }).notNull(),
    to: t.varchar({ length: 256 }).notNull(),
    subject: t.varchar({ length: 2048 }),
    body: t.varchar({ length: 1_000_000 }).notNull(),
    html: t.varchar({ length: 1_000_000 }),
    timestamp: t.timestamp({ precision: 6 }).notNull(),
    viewed: t.boolean().notNull().default(false),
  }),
  (t) => [index("toIdx").on(t.to)]
);

export const inboxes = pgTable(
  "inboxes",
  (t) => ({
    inboxId: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    inbox: t.varchar({ length: 256 }).notNull(),
    silent: t.boolean().notNull().default(false),
    receiver: t.varchar({ length: 256 }),
  }),
  (t) => [uniqueIndex("toInbox").on(t.inbox)]
);

export const attachments = pgTable(
  "attachments",
  (t) => ({
    attachmentId: t.integer().primaryKey().generatedAlwaysAsIdentity(),
    emailId: t.integer().notNull(),
    r2Key: t.varchar({ length: 256 }).notNull(),
    name: t.varchar({ length: 256 }),
    size: t.integer().notNull(),
    contentType: t.varchar({ length: 256 }).notNull(),
    timestamp: t.timestamp({ precision: 6 }).notNull(),
  }),
  (t) => [
    foreignKey({
      columns: [t.emailId],
      foreignColumns: [emails.emailId],
      name: "emailId",
    }).onDelete("cascade"),
  ]
);
