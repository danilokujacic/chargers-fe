import MapView from "@/components/MapView";
import { listSites } from "@/lib/api";

export default async function Home() {
  const sites = await listSites();

  return (
    <div className="h-dvh w-full">
      <MapView initialSites={sites} />
    </div>
  );
}
