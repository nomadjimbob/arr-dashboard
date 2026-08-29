import type { MaintainerrScheduleResponse } from "@arr/shared";
import { apiRequest } from "./base";

export const fetchMaintainerrSchedule = async (
	instanceId: string,
): Promise<MaintainerrScheduleResponse> =>
	apiRequest<MaintainerrScheduleResponse>(`/api/maintainerr/${instanceId}/scheduled`);
