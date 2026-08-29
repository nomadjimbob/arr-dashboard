import type { MaintainerrScheduleResponse, MaintainerrScheduledItem } from "@arr/shared";
import type { FastifyPluginCallback } from "fastify";
import { z } from "zod";
import { requireEnabledInstance } from "../lib/arr/instance-helpers.js";
import { createHttpAuthHeaders, decryptHttpAuthCredentials } from "../lib/services/http-auth.js";
import { validateRequest } from "../lib/utils/validate.js";

const paramsSchema = z.object({ instanceId: z.string().min(1) });
const mediaSchema = z.looseObject({
	mediaServerId: z.string(),
	addDate: z.coerce.date(),
	image_path: z.string().nullish(),
	ruleEvaluationFailed: z.boolean().default(false),
});
const collectionSchema = z.looseObject({
	id: z.coerce.number().int(),
	title: z.string(),
	type: z.string(),
	isActive: z.boolean(),
	arrAction: z.number().int(),
	deleteAfterDays: z.number().int().nonnegative().nullish(),
	media: z.array(mediaSchema).default([]),
});
const collectionsSchema = z.array(collectionSchema);
const metadataSchema = z.looseObject({ title: z.string() });
const ACTION_LABELS: Record<number, string> = {
	0: "Delete",
	1: "Unmonitor and delete all",
	2: "Unmonitor and delete existing",
	3: "Unmonitor",
	5: "Delete show if empty",
	6: "Unmonitor show if empty",
	7: "Change quality profile",
};
const DAY_MS = 86_400_000;
const MAX_SCHEDULE_ITEMS = 250;
const REQUEST_BUDGET_MS = 30_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const readJsonWithLimit = async (response: Response): Promise<unknown> => {
	const declaredLength = Number(response.headers.get("content-length") ?? 0);
	if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("Maintainerr response is too large");
	if (!response.body) return undefined;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_RESPONSE_BYTES) {
			await reader.cancel();
			throw new Error("Maintainerr response is too large");
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

const requireHttpUrl = (value: string): URL => {
	const url = new URL(value);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Maintainerr URLs must use HTTP or HTTPS");
	}
	return url;
};

const maintainerrRoutes: FastifyPluginCallback = (app, _opts, done) => {
	app.get("/:instanceId/scheduled", async (request, reply) => {
		const { instanceId } = validateRequest(paramsSchema, request.params);
		const instance = await requireEnabledInstance(app, request.currentUser!.id, instanceId);
		if (instance.service !== "MAINTAINERR") {
			return reply.status(404).send({ error: "Maintainerr instance not found" });
		}
		const baseUrl = requireHttpUrl(instance.baseUrl).toString().replace(/\/$/, "");
		const externalUrl = requireHttpUrl(instance.externalUrl ?? instance.baseUrl)
			.toString()
			.replace(/\/$/, "");
		const headers = {
			Accept: "application/json",
			...createHttpAuthHeaders(decryptHttpAuthCredentials(app.encryptor, instance)),
		};
		const deadline = Date.now() + REQUEST_BUDGET_MS;
		const response = await fetch(`${baseUrl}/api/collections/overlay-data`, {
			headers,
			signal: AbortSignal.timeout(Math.min(15_000, deadline - Date.now())),
		});
		if (!response.ok) {
			return reply.status(502).send({ error: `Maintainerr returned HTTP ${response.status}` });
		}
		const collections = collectionsSchema.parse(await readJsonWithLimit(response));
		const now = new Date();
		const candidates = collections.flatMap((collection) => {
			if (!collection.isActive || collection.arrAction === 4 || collection.deleteAfterDays == null) {
				return [];
			}
			return collection.media.map((media) => ({
				collection,
				media,
				scheduledAtMs: media.addDate.getTime() + collection.deleteAfterDays * DAY_MS,
			}));
		});

		const selectedCandidates = candidates
			.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs)
			.slice(0, MAX_SCHEDULE_ITEMS);
		const items: MaintainerrScheduledItem[] = [];
		for (let offset = 0; offset < selectedCandidates.length; offset += 6) {
			if (Date.now() >= deadline) break;
			const batch = selectedCandidates.slice(offset, offset + 6);
			const enriched = await Promise.all(
				batch.map(async ({ collection, media, scheduledAtMs }) => {
					let title = media.mediaServerId;
					try {
						const metadataResponse = await fetch(
							`${baseUrl}/api/media-server/meta/${encodeURIComponent(media.mediaServerId)}`,
							{
								headers,
								signal: AbortSignal.timeout(
									Math.max(1, Math.min(10_000, deadline - Date.now())),
								),
							},
						);
						if (metadataResponse.ok) title = metadataSchema.parse(await metadataResponse.json()).title;
					} catch (error) {
						request.log.debug({ error, mediaId: media.mediaServerId }, "Maintainerr metadata lookup failed");
					}
					const scheduledAt = new Date(scheduledAtMs);
					const overdue = scheduledAt.getTime() < now.getTime();
					const daysRemaining = overdue
						? -Math.max(1, Math.ceil((now.getTime() - scheduledAt.getTime()) / DAY_MS))
						: Math.ceil((scheduledAt.getTime() - now.getTime()) / DAY_MS);
					return {
						instanceId: instance.id,
						instanceLabel: instance.label,
						collectionId: collection.id,
						collectionTitle: collection.title,
						mediaId: media.mediaServerId,
						mediaType: collection.type,
						title,
						imagePath: media.image_path,
						addedAt: media.addDate.toISOString(),
						scheduledAt: scheduledAt.toISOString(),
						daysRemaining,
						overdue,
						dueSoon: daysRemaining >= 0 && daysRemaining <= 7,
						action: ACTION_LABELS[collection.arrAction] ?? `Action ${collection.arrAction}`,
						ruleEvaluationFailed: media.ruleEvaluationFailed,
						externalUrl: `${externalUrl}/collections/${collection.id}`,
					} satisfies MaintainerrScheduledItem;
				}),
			);
			items.push(...enriched);
		}
		items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
		const result: MaintainerrScheduleResponse = {
			items,
			overdueCount: items.filter((item) => item.overdue).length,
			dueSoonCount: items.filter((item) => item.dueSoon).length,
			totalCount: candidates.length,
			truncated: items.length < candidates.length,
			refreshedAt: now.toISOString(),
		};
		return reply.send(result);
	});
	done();
};

export const registerMaintainerrRoutes = maintainerrRoutes;
