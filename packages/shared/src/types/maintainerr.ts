import { z } from "zod";

export const maintainerrScheduledItemSchema = z.object({
	instanceId: z.string(),
	instanceLabel: z.string(),
	collectionId: z.number().int(),
	collectionTitle: z.string(),
	mediaId: z.string(),
	mediaType: z.string(),
	title: z.string(),
	imagePath: z.string().nullish(),
	addedAt: z.string(),
	scheduledAt: z.string(),
	daysRemaining: z.number().int(),
	overdue: z.boolean(),
	dueSoon: z.boolean(),
	action: z.string(),
	ruleEvaluationFailed: z.boolean(),
	externalUrl: z.string(),
});

export const maintainerrScheduleResponseSchema = z.object({
	items: z.array(maintainerrScheduledItemSchema),
	overdueCount: z.number().int().nonnegative(),
	dueSoonCount: z.number().int().nonnegative(),
	totalCount: z.number().int().nonnegative(),
	truncated: z.boolean(),
	refreshedAt: z.string(),
});

export type MaintainerrScheduledItem = z.infer<typeof maintainerrScheduledItemSchema>;
export type MaintainerrScheduleResponse = z.infer<typeof maintainerrScheduleResponseSchema>;
