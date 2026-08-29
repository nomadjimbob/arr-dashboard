"use client";

import type { MaintainerrScheduledItem } from "@arr/shared";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ExternalLink, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import { PageHeader } from "../../../components/layout";
import { Alert, AlertDescription, Badge, Card, CardContent } from "../../../components/ui";
import { useServicesQuery } from "../../../hooks/api/useServicesQuery";
import { useIncognitoMode, getLinuxIsoName, getLinuxInstanceName } from "../../../lib/incognito";
import { fetchMaintainerrSchedule } from "../../../lib/api-client/maintainerr";
import { maintainerrKeys } from "../../../lib/query-keys";
import { POLLING_BACKGROUND } from "../../../lib/polling-intervals";

const formatDue = (item: MaintainerrScheduledItem) => {
	if (item.overdue) return `${Math.abs(item.daysRemaining)} day${Math.abs(item.daysRemaining) === 1 ? "" : "s"} overdue`;
	if (item.daysRemaining === 0) return "Due today";
	return `Due in ${item.daysRemaining} day${item.daysRemaining === 1 ? "" : "s"}`;
};

export const MaintainerrClient = () => {
	const { data: services = [], isLoading: servicesLoading } = useServicesQuery();
	const [isIncognito] = useIncognitoMode();
	const instances = useMemo(
		() => services.filter((service) => service.service === "maintainerr" && service.enabled),
		[services],
	);
	const instanceIds = useMemo(() => instances.map((instance) => instance.id), [instances]);
	const schedule = useQuery({
		queryKey: maintainerrKeys.schedule(instanceIds),
		queryFn: async () => {
			const results = await Promise.allSettled(instanceIds.map(fetchMaintainerrSchedule));
			return {
				items: results
					.flatMap((result) => (result.status === "fulfilled" ? result.value.items : []))
					.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
				failedInstanceLabels: results.flatMap((result, index) =>
					result.status === "rejected" ? [instances[index]?.label ?? "Maintainerr"] : [],
				),
				truncated: results.some(
					(result) => result.status === "fulfilled" && result.value.truncated,
				),
				totalCount: results.reduce(
					(total, result) => total + (result.status === "fulfilled" ? result.value.totalCount : 0),
					0,
				),
			};
		},
		enabled: instanceIds.length > 0,
		refetchInterval: POLLING_BACKGROUND,
	});
	const items = schedule.data?.items ?? [];
	const overdue = items.filter((item) => item.overdue).length;
	const dueSoon = items.filter((item) => item.dueSoon).length;

	return (
		<div className="space-y-6">
			<PageHeader
				title="Maintainerr"
				description="Scheduled media actions that may need your attention"
			/>
			{!servicesLoading && instances.length === 0 && (
				<Alert>
					<AlertDescription>
						Add a Maintainerr instance under Settings → Services to see scheduled removals.
					</AlertDescription>
				</Alert>
			)}
			{schedule.data && schedule.data.failedInstanceLabels.length > 0 && (
				<Alert variant="danger">
					<AlertDescription>
						Could not reach: {schedule.data.failedInstanceLabels.join(", ")}. Other instances are still shown.
					</AlertDescription>
				</Alert>
			)}
			{schedule.data?.truncated && (
				<Alert variant="warning">
					<AlertDescription>
						The feed is capped to protect Maintainerr. Open Maintainerr for the complete schedule.
					</AlertDescription>
				</Alert>
			)}
			{schedule.isLoading && instances.length > 0 && (
				<p className="text-sm text-muted-foreground">Loading scheduled actions…</p>
			)}
			{!schedule.isLoading && <div className="grid gap-4 sm:grid-cols-3">
				<Card><CardContent className="flex items-center gap-3 p-5"><ShieldAlert className="h-6 w-6 text-destructive"/><div><p className="text-2xl font-semibold">{overdue}</p><p className="text-sm text-muted-foreground">Overdue</p></div></CardContent></Card>
				<Card><CardContent className="flex items-center gap-3 p-5"><AlertTriangle className="h-6 w-6 text-warning"/><div><p className="text-2xl font-semibold">{dueSoon}</p><p className="text-sm text-muted-foreground">Due within 7 days</p></div></CardContent></Card>
				<Card><CardContent className="flex items-center gap-3 p-5"><CalendarClock className="h-6 w-6 text-primary"/><div><p className="text-2xl font-semibold">{schedule.data?.totalCount ?? items.length}</p><p className="text-sm text-muted-foreground">Scheduled total</p></div></CardContent></Card>
			</div>}
			<div className="space-y-3">
				{schedule.isSuccess &&
					items.length === 0 &&
					schedule.data.failedInstanceLabels.length === 0 && (
						<Card>
							<CardContent className="p-6 text-center text-sm text-muted-foreground">
								All clear — Maintainerr has no scheduled actions.
							</CardContent>
						</Card>
					)}
				{items.map((item) => (
					<Card key={`${item.instanceId}:${item.collectionId}:${item.mediaId}`}>
						<CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<p className="truncate font-medium">{isIncognito ? getLinuxIsoName(item.title) : item.title}</p>
									<Badge variant={item.overdue ? "danger" : item.dueSoon ? "warning" : "secondary"}>{formatDue(item)}</Badge>
									{item.ruleEvaluationFailed && <Badge variant="danger">Rule evaluation failed</Badge>}
								</div>
								<p className="mt-1 text-sm text-muted-foreground">
									{isIncognito ? getLinuxInstanceName(item.instanceLabel) : item.instanceLabel} · {item.collectionTitle} · {item.action}
								</p>
							</div>
							<a className="inline-flex items-center gap-2 text-sm text-primary hover:underline" href={item.externalUrl} target="_blank" rel="noreferrer">Open in Maintainerr <ExternalLink className="h-4 w-4"/></a>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
};
