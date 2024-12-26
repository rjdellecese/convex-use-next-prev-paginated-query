import { v } from "convex/values";
import { query } from "./_generated/server";

export const getMessages = query({
	args: {
		channel: v.string(),
		paginationOpts: v.object({
			cursor: v.union(v.string(), v.null()),
			numItems: v.number(),
		}),
	},
	handler: async ({ db }, { channel, paginationOpts }) => {
		return await db
			.query("messages")
			.filter((q) => q.eq(q.field("channel"), channel))
			.paginate(paginationOpts);
	},
});
