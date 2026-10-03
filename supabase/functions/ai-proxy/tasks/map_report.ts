// IntMap · ai-proxy · tasks/map_report — a mapped report of N items
import { defineTask } from "./spec.ts";

// (#R113) Gemini Structured Output schema for map_report. The model returns ONLY
// name/locationName/country/summary/date/evidenceIds — the client fills url, source,
// publishedAt and the real lat/lng (geocoded) so the model can't invent coordinates
// or sources. `type` uses the REST Schema enum (uppercase) per the generateContent docs.
export const MAP_REPORT_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    overview: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          locationName: { type: "STRING" },
          country: { type: "STRING" },
          summary: { type: "STRING" },
          date: { type: "STRING" },
          evidenceIds: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["name", "locationName", "country", "summary", "evidenceIds"],
        propertyOrdering: ["name", "locationName", "country", "summary", "date", "evidenceIds"],
      },
    },
  },
  required: ["title", "overview", "items"],
  propertyOrdering: ["title", "overview", "items"],
};

export default defineTask({
  name: "map_report",
  maxOutput: 3200,
  // Kept modest for cost; map_report additionally scales with the requested item count.
  perRequestedItem: { base: 1000, each: 180 },
  reasoning: "low",
  json: true,
  schema: MAP_REPORT_SCHEMA,   // server-owned
});
