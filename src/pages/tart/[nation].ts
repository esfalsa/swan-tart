import type { APIRoute } from "astro";
import { SaxesParser } from "saxes";
import pkg from "../../../package.json";

const res = await fetch("https://www.nationstates.net/pages/nations.xml.gz", {
  headers: {
    "User-Agent": `swan-tart/${pkg.version} (by:Esfalsa)`,
  },
});

const dumpText = res.body
  // @ts-expect-error DecompressionStream is available from the global object in Node 18
  // https://nodejs.org/docs/latest-v18.x/api/webstreams.html#class-decompressionstream
  ?.pipeThrough(new DecompressionStream("gzip"))
  .pipeThrough(new TextDecoderStream());

const memberNations = new Map<string, string[]>();
const residentNations = new Set<string>();

let currentTag: string | undefined;
let currentNation: string | undefined;
let currentRegion: string | undefined;
let currentEndorsements: string | undefined;
let currentWAStatus: boolean | undefined;

const parser = new SaxesParser();

parser.on("opentag", (tag) => {
  currentTag = tag.name;
});

parser.on("text", (text) => {
  if (currentTag === "NAME") {
    currentNation = text.toLowerCase().replaceAll(" ", "_");
  } else if (currentTag === "REGION") {
    currentRegion = text.toLowerCase();
  } else if (currentTag === "UNSTATUS") {
    currentWAStatus = text !== "Non-member";
  } else if (currentTag === "ENDORSEMENTS") {
    currentEndorsements = text.toLowerCase().replaceAll(" ", "_");
  }
});

parser.on("closetag", (tag) => {
  currentTag = undefined;

  if (tag.name === "NATION") {
    if (currentRegion === "the south pacific" && currentNation) {
      // if nation is a WA member
      if (currentWAStatus) {
        memberNations.set(
          currentNation,
          currentEndorsements ? currentEndorsements.split(",") : []
        );
      }

      residentNations.add(currentNation);
    }

    currentNation = undefined;
    currentRegion = undefined;
    currentWAStatus = undefined;
    currentEndorsements = undefined;
  }
});

// @ts-expect-error ReadableStream supports async iteration in Node 18
// https://nodejs.org/docs/latest-v18.x/api/webstreams.html#async-iteration
for await (const chunk of dumpText) {
  parser.write(chunk);
}

export const get: APIRoute = async function get({ params }) {
  if (!params.nation) {
    // mismatched params probably means erroneous file or parameter name
    throw new Error("Invalid URL parameters.");
  }

  // if nation is not a WA member, return all WA member nations
  if (!(params.nation in memberNations)) {
    return { body: JSON.stringify(Object.keys(memberNations)) };
  }

  const nations: string[] = [];

  for (const nation in memberNations) {
    if (!memberNations.get(nation)?.includes(params.nation)) {
      nations.push(nation);
    }
  }

  return { body: JSON.stringify(nations) };
};

export function getStaticPaths() {
  return [...residentNations].map((key) => ({ params: { nation: key } }));
}
