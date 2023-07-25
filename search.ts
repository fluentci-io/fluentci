import { cyan, gray, brightGreen } from "colors";

async function search(query: string) {
  const response = await fetch(`https://search.fluentci.io?q=${query}`);
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
      `* ${cyan(item.name)}${gray("@")}${gray(item.version)} - ${
        item.description
      }`
    );
  }
}

export default search;
