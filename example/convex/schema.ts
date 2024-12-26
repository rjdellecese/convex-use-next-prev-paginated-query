import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	messages: defineTable({
		channel: v.string(),
		content: v.string(),
	}).index("by_channel", ["channel"]),
});
