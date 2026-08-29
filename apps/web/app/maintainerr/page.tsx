import { PageLayout } from "../../src/components/layout";
import { MaintainerrClient } from "../../src/features/maintainerr/components/maintainerr-client";

export const metadata = { title: "Maintainerr · Arr Control Center" };

export default function MaintainerrPage() {
	return <PageLayout maxWidth="7xl"><MaintainerrClient /></PageLayout>;
}
