import "dotenv/config";
import type { ToolExecutionOptions } from "ai";
import { describe, expect, it } from "vitest";
import { createTinyfishTools } from "./tinyfish";

const RUN_LIVE_TESTS = process.env.RUN_TINYFISH_LIVE_TESTS === "true";

type SearchResult = {
  title: string;
  url: string;
  content: string;
  siteName: string;
  position: number | null;
};

type FetchResult = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  text: string | object;
};

type GroundTruthCase = {
  name: string;
  query: string;
  language?: string;
  location?: string;
  expected: RegExp[];
};

type TinyfishTools = ReturnType<typeof createTinyfishTools>;
type TinyfishSearchInput = Parameters<
  NonNullable<TinyfishTools["tinyfishSearch"]["execute"]>
>[0];
type TinyfishFetchInput = Parameters<
  NonNullable<TinyfishTools["tinyfishFetch"]["execute"]>
>[0];

const toolExecutionOptions: ToolExecutionOptions = {
  toolCallId: "tinyfish-live-test-call",
  messages: [],
};

async function executeSearch(tools: TinyfishTools, input: TinyfishSearchInput) {
  const execute = tools.tinyfishSearch.execute;
  if (!execute) {
    throw new Error("tinyfishSearch execute is missing");
  }
  return (await execute(input, toolExecutionOptions)) as {
    results: SearchResult[];
    error?: string;
  };
}

async function executeFetch(tools: TinyfishTools, input: TinyfishFetchInput) {
  const execute = tools.tinyfishFetch.execute;
  if (!execute) {
    throw new Error("tinyfishFetch execute is missing");
  }
  return (await execute(input, toolExecutionOptions)) as {
    results: FetchResult[];
  };
}

const groundTruthCases: GroundTruthCase[] = [
  {
    name: "Serie C 2022/23 promotions",
    query:
      "Serie C 2022-23 Feralpisalò Reggiana Catanzaro Lecco promoted play-off winners",
    language: "en",
    location: "GB",
    expected: [/Feralpisal[oò]/i, /Reggiana/i, /Catanzaro/i, /Lecco/i],
  },
  {
    name: "National League 2022/23 top two points and goal difference",
    query:
      "National League 2022-23 Wrexham 111 Notts County 107 goal difference +75 +73",
    language: "en",
    location: "GB",
    expected: [
      /Wrexham/i,
      /\b111\b/,
      /Notts County/i,
      /\b107\b/,
      /\+75\b/,
      /\+73\b/,
    ],
  },
  {
    name: "USL Championship 2022 final score",
    query: "2022 USL Championship Final San Antonio FC 3-1 Louisville City FC",
    language: "en",
    location: "US",
    expected: [/San Antonio FC/i, /Louisville City FC/i, /\b3[\s–-]1\b/],
  },
  {
    name: "Liga Portugal 2 2021/22 promoted teams points",
    query: "Liga Portugal 2 2021-22 Rio Ave 70 Casa Pia 68 Chaves 64",
    language: "en",
    location: "GB",
    expected: [
      /Rio Ave/i,
      /\b70\b/,
      /Casa Pia/i,
      /\b68\b/,
      /Chaves/i,
      /\b64\b/,
    ],
  },
];

function textFromSearchResults(results: SearchResult[]) {
  return results
    .map((result) =>
      [result.title, result.siteName, result.content, result.url].join(" "),
    )
    .join("\n");
}

function textFromFetchResults(results: FetchResult[]) {
  return results
    .map((result) =>
      [
        result.title,
        result.description,
        typeof result.text === "string"
          ? result.text
          : JSON.stringify(result.text),
        result.finalUrl,
      ].join(" "),
    )
    .join("\n");
}

describe.skipIf(!RUN_LIVE_TESTS)("TinyFish live sports ground truth", () => {
  it.each(groundTruthCases)(
    "searches and fetches evidence for $name",
    async ({ query, language, location, expected }) => {
      const tools = createTinyfishTools();

      const searchResult = await executeSearch(tools, {
        query,
        language,
        location,
      });

      expect(searchResult).not.toHaveProperty("error");
      const searchResults = searchResult.results as SearchResult[];
      expect(searchResults.length).toBeGreaterThan(0);

      const fetchUrls = searchResults
        .map((result) => result.url)
        .filter((url) => url.startsWith("http"))
        .slice(0, 5);
      expect(fetchUrls.length).toBeGreaterThan(0);

      const fetchResult = await executeFetch(tools, {
        urls: fetchUrls,
        format: "markdown",
        ttl: 86_400,
        perUrlTimeoutMs: 45_000,
      });

      const fetchedPages = fetchResult.results as FetchResult[];
      expect(fetchedPages.length).toBeGreaterThan(0);

      const evidence = [
        textFromSearchResults(searchResults),
        textFromFetchResults(fetchedPages),
      ].join("\n");

      for (const pattern of expected) {
        expect(evidence).toMatch(pattern);
      }
    },
    60_000,
  );
});
