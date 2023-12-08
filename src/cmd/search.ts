import { cyan, gray, brightGreen } from "../../deps.ts";

/**
 * Searches for packages on the FluentCI registry.
 * @param query - The search query.
 * @param options - The search options.
 * @param options.limit - The maximum number of results to return.
 */
async function search(query: string, options: { limit: number }) {
  const response = await fetch(
    `https://search.fluentci.io?q=${query}&limit=${options.limit}`
  );
  const { results } = await response.json();

  if (results.length === 0) {
    console.log(`No results found for ${brightGreen(query)}`);
    return;
  }

  console.log(
    `Found ${brightGreen(results.length.toString())} ${
      results.length > 1 ? "results" : "result"
    } for ${brightGreen('"')}${brightGreen(query)}${brightGreen('"')}:\n`
  );

  for (const item of results) {
    console.log(
      `* ${cyan(item.name)}${gray("@")}${gray(
        item.version || item.default_branch
      )} - ${item.description}`
    );
  }
}

export default search;
