"use client";

import type { MaintainerrScheduledItem } from "@arr/shared";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ChevronRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { fetchMaintainerrSchedule } from "../../../lib/api-client/maintainerr";
import { getLinuxIsoName, useIncognitoMode } from "../../../lib/incognito";
import { POLLING_BACKGROUND } from "../../../lib/polling-intervals";
import { maintainerrKeys } from "../../../lib/query-keys";
import { SEMANTIC_COLORS, SERVICE_GRADIENTS } from "../../../lib/theme-gradients";

const maintainerrGradient = SERVICE_GRADIENTS.maintainerr;

interface MaintainerrWidgetProps {
	instances: Array<{ id: string; label: string }>;
	animationDelay?: number;
}

const formatDue = (item: MaintainerrScheduledItem) => {
	if (item.overdue) {
		const days = Math.abs(item.daysRemaining);
		return `${days} day${days === 1 ? "" : "s"} overdue`;
	}
	if (item.daysRemaining === 0) return "Due today";
	return `Due in ${item.daysRemaining} day${item.daysRemaining === 1 ? "" : "s"}`;
};

export const MaintainerrWidget = ({
	instances,
	animationDelay = 0,
}: MaintainerrWidgetProps) => {
	const [incognitoMode] = useIncognitoMode();
	const instanceIds = useMemo(() => instances.map((instance) => instance.id), [instances]);
	const schedule = useQuery({
		queryKey: maintainerrKeys.schedule(instanceIds),
		queryFn: async () => {
			const results = await Promise.allSettled(instanceIds.map(fetchMaintainerrSchedule));
			return {
				items: results
					.flatMap((result) => (result.status === "fulfilled" ? result.value.items : []))
					.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
				totalCount: results.reduce(
					(total, result) =>
						total + (result.status === "fulfilled" ? result.value.totalCount : 0),
					0,
				),
				failed: results.filter((result) => result.status === "rejected").length,
			};
		},
		enabled: instanceIds.length > 0,
		refetchInterval: POLLING_BACKGROUND,
	});

	if (!schedule.data && !schedule.isError) return null;

	const items = schedule.data?.items ?? [];
	const overdue = items.filter((item) => item.overdue).length;
	const dueSoon = items.filter((item) => item.dueSoon).length;
	const total = schedule.data?.totalCount ?? items.length;

	return (
		<div
			className="animate-in fade-in slide-in-from-bottom-4 duration-500"
			style={{ animationDelay: `${animationDelay}ms`, animationFillMode: "backwards" }}
		>
			<Link href="/maintainerr" className="block">
				<div className="group overflow-hidden rounded-xl border border-border/30 bg-muted/10 transition-all hover:border-border/80">
					<div
						className="h-0.5 w-full rounded-t-xl"
						style={{
							background: `linear-gradient(90deg, ${maintainerrGradient.from}, ${maintainerrGradient.to})`,
						}}
					/>
					<div className="p-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-card/40">
									<CalendarClock
										className="h-4 w-4"
										style={{ color: maintainerrGradient.from }}
									/>
								</div>
								<div>
									<h3 className="text-sm font-semibold text-foreground">Maintainerr</h3>
									<p className="text-xs text-muted-foreground">Scheduled cleanup actions</p>
								</div>
							</div>
							<ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
						</div>

						{schedule.isError || schedule.data?.failed === instances.length ? (
							<p className="mt-4 text-xs text-destructive">Could not load the Maintainerr schedule</p>
						) : (
							<>
								<div className="mt-4 grid grid-cols-3 gap-2">
									<Summary value={overdue} label="Overdue" icon={ShieldAlert} color={SEMANTIC_COLORS.error.text} />
									<Summary value={dueSoon} label="Next 7 days" icon={AlertTriangle} color={SEMANTIC_COLORS.warning.text} />
									<Summary value={total} label="Scheduled" icon={CalendarClock} color="var(--primary)" />
								</div>
								<div className="mt-3 space-y-1.5">
									{items.slice(0, 3).map((item) => (
										<div key={`${item.instanceId}:${item.collectionId}:${item.mediaId}`} className="flex items-center justify-between gap-3 rounded-lg border border-border/20 bg-card/20 px-3 py-2">
											<div className="min-w-0">
												<p className="truncate text-xs font-medium text-foreground">{incognitoMode ? getLinuxIsoName(item.title) : item.title}</p>
												<p className="truncate text-[10px] text-muted-foreground">{item.action}</p>
											</div>
											<span className="shrink-0 text-[10px] font-medium" style={{ color: item.overdue ? SEMANTIC_COLORS.error.text : item.dueSoon ? SEMANTIC_COLORS.warning.text : "var(--muted-foreground)" }}>{formatDue(item)}</span>
										</div>
									))}
									{items.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">All clear — no scheduled actions</p>}
								</div>
							</>
						)}
					</div>
				</div>
			</Link>
		</div>
	);
};

const Summary = ({ value, label, icon: Icon, color }: { value: number; label: string; icon: typeof CalendarClock; color: string }) => (
	<div className="rounded-lg border border-border/20 bg-card/20 p-2">
		<div className="flex items-center gap-1.5"><Icon className="h-3 w-3" style={{ color }} /><span className="text-sm font-semibold text-foreground">{value}</span></div>
		<p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
	</div>
);
