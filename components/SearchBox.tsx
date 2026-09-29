"use client";

import type { Map as MaptilerMap } from "@maptiler/sdk";
import { useState } from "react";

/** Geocodes against Nominatim (10-frontend-nextjs.md §H). The public
 * `nominatim.openstreetmap.org` instance expects an identifying User-Agent and roughly one
 * request per second — fine for a search box a person types into, not for unlimited traffic. */
async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "me");

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    return null;
  }
  const results = (await res.json()) as { lat: string; lon: string }[];
  const first = results[0];
  return first ? { lat: Number(first.lat), lon: Number(first.lon) } : null;
}

export default function SearchBox({ map }: { map: MaptilerMap | null }) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!map || !query.trim()) {
      return;
    }
    setPending(true);
    setNotFound(false);
    try {
      const result = await geocode(query);
      if (result) {
        map.easeTo({ center: [result.lon, result.lat], zoom: 14, duration: 500 });
      } else {
        setNotFound(true);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute top-3 left-3 z-10 flex w-64 max-w-[calc(100%-1.5rem)] gap-1"
    >
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search a place in Montenegro…"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-3 py-2 text-sm shadow disabled:opacity-50"
      >
        {pending ? "…" : "Go"}
      </button>
      {notFound && (
        <p className="absolute top-full mt-1 text-xs text-red-600">Nothing found.</p>
      )}
    </form>
  );
}
