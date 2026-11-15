import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { loadPlanLevels } from "@/lib/plans";
import { parsePeriod, searchSpots } from "@/lib/booking/search";
import { SearchView } from "./SearchView";

export async function generateMetadata() {
  const t = await getTranslations("map");
  return { title: t("title") };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireUser();
  const t = await getTranslations("map");
  const period = parsePeriod(await searchParams);
  const [spots, levels] = await Promise.all([searchSpots(user, period.start, period.end), loadPlanLevels()]);
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("title")}</h1>
      <SearchView
        levels={levels.map((l) => ({ name: l.name, svg: l.svg, planNumbers: l.areaIds }))}
        spots={spots}
        periodValid={period.valid}
        period={{ fromDate: period.fromDate, fromTime: period.fromTime, toDate: period.toDate, toTime: period.toTime }}
      />
    </div>
  );
}
