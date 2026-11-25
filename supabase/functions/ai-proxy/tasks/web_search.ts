// IntMap · ai-proxy · tasks/web_search — ONE live web search asked as its own call (js/atlas-cap-web.js web.search)
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "web_search",
  maxOutput: 1800,   // (atlas-search-evidence-store) the findings of one question — facts with dates and the addresses that state them, as plain text. The size a brief gets (1800): a search is a short report, and several of these run at once
  reasoning: "low",   // what the call is for is the search; its freshness comes from the forced web search (webMode required), not from reasoning (the brief's own reasoning, #R116)
});
