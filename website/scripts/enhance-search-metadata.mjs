import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(here, "..", "public");
const siteUrl = "https://maqamagent.com";
const repository = "https://github.com/AjnasNB/maqam";
const npmPackage = "https://www.npmjs.com/package/maqam";
const defaultImage = `${siteUrl}/assets/maqam-exact-gate-3d.png`;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.name === "index.html") files.push(full);
  }
  return files;
}

function decodeAttribute(value) {
  const entities = new Map([
    ["&amp;", "&"],
    ["&quot;", '"'],
    ["&#39;", "'"],
    ["&lt;", "<"],
    ["&gt;", ">"]
  ]);
  return value.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => entities.get(entity));
}

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function jsonLdFor({ canonical, description, route, title }) {
  if (route === "/") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SoftwareApplication",
          name: "Maqam",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Node.js 22, 24, or 26",
          softwareVersion: "0.3.2",
          license: "https://opensource.org/license/mit",
          codeRepository: repository,
          downloadUrl: npmPackage,
          sameAs: [repository, npmPackage],
          isAccessibleForFree: true,
          featureList: [
            "AI agent tool governance",
            "Exact one-use human approvals",
            "Policy before registered tool execution",
            "Replay rejection",
            "Coding-agent CLI adapters",
            "Governed browser action contracts",
            "Evidence-linked execution receipts"
          ],
          description
        },
        {
          "@type": "WebSite",
          name: "Maqam",
          url: siteUrl,
          description: "Documentation for the Maqam open-source AI agent governance framework."
        },
        {
          "@type": "SoftwareSourceCode",
          name: "Maqam source code",
          codeRepository: repository,
          codeSampleType: "full solution",
          programmingLanguage: ["JavaScript", "TypeScript"],
          license: "https://opensource.org/license/mit",
          runtimePlatform: "Node.js 22, 24, or 26"
        }
      ]
    };
  }

  if (route.startsWith("/articles/") || route.startsWith("/releases/")) {
    return {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: title,
      description,
      dateModified: "2026-07-23",
      author: { "@type": "Person", name: "Ajnas N B" },
      publisher: { "@type": "Organization", name: "Maqam", url: siteUrl },
      mainEntityOfPage: canonical
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: canonical,
    dateModified: "2026-07-23",
    isPartOf: { "@type": "WebSite", name: "Maqam", url: siteUrl },
    about: { "@type": "SoftwareApplication", name: "Maqam", url: siteUrl }
  };
}

for (const file of await walk(publicRoot)) {
  let html = await readFile(file, "utf8");
  const relative = path.relative(publicRoot, file).replaceAll("\\", "/");
  const route = relative === "index.html" ? "/" : `/${relative.replace(/index\.html$/, "")}`;
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const descriptionMatch = html.match(/<meta name="description" content="([^"]+)">/i);
  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)">/i);
  if (!titleMatch || !descriptionMatch || !canonicalMatch) {
    throw new Error(`${relative} is missing title, description, or canonical metadata`);
  }

  const title = decodeAttribute(titleMatch[1]);
  const description = decodeAttribute(descriptionMatch[1]);
  const canonical = canonicalMatch[1];
  const article = route.startsWith("/articles/") || route.startsWith("/releases/");
  const schema = JSON.stringify(jsonLdFor({ canonical, description, route, title })).replaceAll("<", "\\u003c");

  html = html
    .replace(/\s*<meta name="robots"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="author"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="application-name"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta property="og:[^"]+"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="twitter:[^"]+"[^>]*>\s*/gi, "\n")
    .replace(/\s*<script type="application\/ld\+json" data-search-metadata>[\s\S]*?<\/script>\s*/gi, "\n");

  const metadata = [
    '  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
    '  <meta name="author" content="Ajnas N B">',
    '  <meta name="application-name" content="Maqam">',
    `  <meta property="og:type" content="${article ? "article" : "website"}">`,
    '  <meta property="og:locale" content="en_US">',
    '  <meta property="og:site_name" content="Maqam">',
    `  <meta property="og:title" content="${escapeAttribute(title)}">`,
    `  <meta property="og:description" content="${escapeAttribute(description)}">`,
    `  <meta property="og:url" content="${escapeAttribute(canonical)}">`,
    `  <meta property="og:image" content="${defaultImage}">`,
    '  <meta property="og:image:width" content="1586">',
    '  <meta property="og:image:height" content="992">',
    '  <meta property="og:image:alt" content="Maqam exact approval gate for governed AI agent actions">',
    '  <meta name="twitter:card" content="summary_large_image">',
    `  <meta name="twitter:title" content="${escapeAttribute(title)}">`,
    `  <meta name="twitter:description" content="${escapeAttribute(description)}">`,
    `  <meta name="twitter:image" content="${defaultImage}">`,
    '  <meta name="twitter:image:alt" content="Maqam exact approval gate for governed AI agent actions">',
    `  <script type="application/ld+json" data-search-metadata>${schema}</script>`
  ].join("\n");

  html = html.replace(
    /\s*<link rel="canonical" href="[^"]+">/i,
    `\n${metadata}\n  <link rel="canonical" href="${escapeAttribute(canonical)}">`
  );
  await writeFile(file, html.replace(/\n{3,}/g, "\n\n"), "utf8");
}

console.log("Enhanced search metadata for every Maqam HTML page.");
