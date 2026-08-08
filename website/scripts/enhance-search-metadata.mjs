import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(here, "..", "public");
const siteUrl = "https://maqamagent.com";
const repository = "https://github.com/AjnasNB/maqam";
const npmPackage = "https://www.npmjs.com/package/maqam";
const defaultImage = `${siteUrl}/assets/maqam-exact-gate-3d.png`;
const modifiedDate = "2026-08-08";
const toolkitArticleDate = "2026-08-09";
const author = { "@type": "Person", name: "Ajnas N B", url: "https://github.com/AjnasNB" };
const publisher = { "@type": "Organization", name: "Maqam", url: siteUrl };

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

function ensurePaperNavigation(html, className) {
  const navigation = new RegExp(`(<nav\\s+class="${className}"[^>]*>)([\\s\\S]*?)(<\\/nav>)`, "i");
  return html.replace(navigation, (whole, opening, content, closing) => {
    if (/href="\/paper\/"/i.test(content)) return whole;
    const link = '<a href="/paper/">Paper</a>';
    if (/\s*<a href="\/releases\/v0\.3\.3\/">Release<\/a>/i.test(content)) {
      content = content.replace(
        /(\s*)(<a href="\/releases\/v0\.3\.3\/">Release<\/a>)/i,
        `$1${link}$1$2`
      );
    } else {
      content += `\n      ${link}`;
    }
    return opening + content + closing;
  });
}

function ensureAlternativesNavigation(html, className, route) {
  const navigation = new RegExp(`(<nav\\s+class="${className}"[^>]*>)([\\s\\S]*?)(<\\/nav>)`, "i");
  return html.replace(navigation, (whole, opening, content, closing) => {
    const active = route === "/alternatives/" ? ' aria-current="page"' : "";
    const link = `<a href="/alternatives/"${active}>Compare</a>`;

    if (/href="\/alternatives\/"/i.test(content)) {
      content = content.replace(
        /<a href="\/alternatives\/"(?:\s+aria-current="page")?>[^<]*<\/a>/i,
        link
      );
    } else if (/href="\/why\/"/i.test(content)) {
      content = content.replace(
        /<a href="\/why\/"(?:\s+aria-current="page")?>[^<]*<\/a>/i,
        link
      );
    } else if (/\s*<a href="\/docs\/integrations\/"/i.test(content)) {
      content = content.replace(
        /(\s*)(<a href="\/docs\/integrations\/"[^>]*>)/i,
        `$1${link}$1$2`
      );
    } else {
      content += `\n      ${link}`;
    }

    return opening + content + closing;
  });
}

function breadcrumbFor(route) {
  const labels = new Map([
    ["articles", "Articles"], ["benchmarking-governance", "Benchmarking governance"],
    ["exact-agent-approvals", "Exact agent approvals"], ["community", "Community"],
    ["open-source-governed-agent-toolkit", "Open-source governed-agent toolkit"],
    ["docs", "Documentation"], ["benchmark", "Benchmark"], ["browser", "Browser"],
    ["integrations", "Integrations"], ["productloop", "ProductLoop OS"],
    ["security", "Security"], ["sources", "Sources"], ["workbench", "Workbench"],
    ["alternatives", "Alternatives"], ["paper", "Technical paper"], ["releases", "Releases"], ["roadmap", "Roadmap"],
    ["why", "Why Maqam"]
  ]);
  const parts = route.split("/").filter(Boolean);
  const items = [{ "@type": "ListItem", position: 1, name: "Maqam", item: `${siteUrl}/` }];
  let current = "";
  for (const [index, part] of parts.entries()) {
    current += `/${part}`;
    items.push({
      "@type": "ListItem",
      position: index + 2,
      name: labels.get(part) || part.replaceAll("-", " "),
      item: `${siteUrl}${current}/`
    });
  }
  return { "@type": "BreadcrumbList", itemListElement: items };
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
          softwareVersion: "0.3.3",
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
        },
        {
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is Maqam?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Maqam is an open-source TypeScript governance boundary for registered AI-agent tool calls. It evaluates policy before dispatch, can require approval for an exact input, and records execution receipts."
              }
            },
            {
              "@type": "Question",
              name: "What does exact one-use approval mean?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Approval is bound to a run, tool name, and canonical input hash. Changed input is rejected, and the approval is consumed once by default so replay is rejected."
              }
            },
            {
              "@type": "Question",
              name: "Does Maqam govern every action an AI agent can take?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Maqam governs only operations deliberately routed through a registered Maqam boundary. Direct operating-system, network, provider, or unregistered calls remain outside its control."
              }
            }
          ]
        }
      ]
    };
  }

  if (route === "/paper/") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "ScholarlyArticle",
          headline: "Maqam: Exact-Input Governance for Registered AI-Agent Actions",
          description,
          version: "1.0",
          datePublished: modifiedDate,
          dateModified: modifiedDate,
          author,
          publisher,
          identifier: "https://doi.org/10.5281/zenodo.21851251",
          sameAs: "https://doi.org/10.5281/zenodo.21851251",
          license: "https://creativecommons.org/licenses/by/4.0/",
          mainEntityOfPage: canonical,
          url: canonical,
          inLanguage: "en",
          isBasedOn: "https://github.com/AjnasNB/maqam/tree/v0.3.3",
          keywords: ["AI agent governance", "exact approval", "tool gateway", "execution receipts", "MGES"]
        },
        breadcrumbFor(route)
      ]
    };
  }

  if (route === "/alternatives/") {
    const alternatives = [
      ["Microsoft Agent Governance Toolkit", "https://github.com/microsoft/agent-governance-toolkit"],
      ["OpenAI Agents SDK for TypeScript", "https://openai.github.io/openai-agents-js/"],
      ["LangGraph for JavaScript", "https://docs.langchain.com/oss/javascript/langgraph/overview"],
      ["Open Policy Agent", "https://www.openpolicyagent.org/docs"],
      ["Cedar Policy Language", "https://docs.cedarpolicy.com/"],
      ["Invariant Guardrails", "https://invariantlabs.ai/blog/guardrails"],
      ["NVIDIA NeMo Guardrails", "https://docs.nvidia.com/nemo/guardrails/latest/home"],
      ["Guardrails AI", "https://github.com/guardrails-ai/guardrails"]
    ];
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          name: title,
          description,
          url: canonical,
          dateModified: modifiedDate,
          inLanguage: "en",
          isPartOf: { "@type": "WebSite", name: "Maqam", url: siteUrl },
          about: { "@type": "SoftwareApplication", name: "Maqam", softwareVersion: "0.3.3", url: siteUrl },
          mainEntity: { "@id": `${canonical}#alternatives` }
        },
        {
          "@type": "ItemList",
          "@id": `${canonical}#alternatives`,
          name: "Representative AI agent governance alternatives and complements",
          numberOfItems: alternatives.length,
          itemListElement: alternatives.map(([name, url], index) => ({
            "@type": "ListItem",
            position: index + 1,
            name,
            url
          }))
        },
        {
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Is Maqam a complete enterprise AI governance platform?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Maqam is a compact TypeScript boundary for registered actions. It does not provide enterprise identity, fleet inventory, operating-system isolation, a distributed approval service, or compliance certification."
              }
            },
            {
              "@type": "Question",
              name: "Does Maqam replace OpenAI Agents SDK or LangGraph?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. OpenAI Agents SDK and LangGraph build and run agents or workflows. Maqam can sit around selected registered tools where policy, exact-input approval, one-use consumption, and execution receipts are required."
              }
            },
            {
              "@type": "Question",
              name: "Can Maqam be used with OPA or Cedar?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. OPA or Cedar can supply an authorization decision while Maqam retains the application-side dispatch, approval, and receipt boundary. The host must implement and test that integration."
              }
            }
          ]
        },
        breadcrumbFor(route)
      ]
    };
  }

  if (route === "/articles/open-source-governed-agent-toolkit/") {
    const toolkit = [
      ["Qarinah", "https://qarinah.io/", "Project memory and context"],
      ["Maqam", "https://maqamagent.com/", "Registered action governance"],
      ["Cockroach Browser", "https://cockroachbrowser.com/", "Authorized browser runtime"],
      ["Cockroach Crawler", "https://cockroachcrawler.com/", "Governed web acquisition"],
      ["Playwright", "https://playwright.dev/docs/intro", "Browser automation primitive"],
      ["Puppeteer", "https://pptr.dev/guides/what-is-puppeteer", "Browser automation primitive"],
      ["Browser Use", "https://github.com/browser-use/browser-use", "Agentic browser framework"],
      ["Stagehand", "https://docs.stagehand.dev/v3/first-steps/introduction", "Agentic browser framework"],
      ["Trafilatura", "https://trafilatura.readthedocs.io/en/stable/index.html", "Web extraction library"],
      ["Firecrawl", "https://docs.firecrawl.dev/introduction", "Web data platform"],
      ["Docling", "https://docling-project.github.io/docling/", "Document conversion toolkit"],
      ["LangGraph", "https://docs.langchain.com/oss/javascript/langgraph/overview", "Agent and workflow runtime"],
      ["OpenAI Agents SDK", "https://openai.github.io/openai-agents-js/", "Agent runtime"]
    ];
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          "@id": `${canonical}#article`,
          headline: title,
          description,
          url: canonical,
          mainEntityOfPage: canonical,
          datePublished: toolkitArticleDate,
          dateModified: toolkitArticleDate,
          author,
          publisher,
          inLanguage: "en",
          about: { "@id": `${canonical}#toolkit-map` }
        },
        {
          "@type": "ItemList",
          "@id": `${canonical}#toolkit-map`,
          name: "Open-source governed-agent toolkit and established adjacent tools",
          itemListOrder: "https://schema.org/ItemListUnordered",
          numberOfItems: toolkit.length,
          itemListElement: toolkit.map(([name, url, category], index) => ({
            "@type": "ListItem",
            position: index + 1,
            item: {
              "@type": "SoftwareApplication",
              name,
              url,
              applicationCategory: category
            }
          }))
        },
        {
          "@type": "FAQPage",
          "@id": `${canonical}#faq`,
          mainEntity: [
            {
              "@type": "Question",
              name: "Is this one bundled agent platform?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Qarinah, Maqam, Cockroach Browser, and Cockroach Crawler are separate open-source projects. The other named tools are third-party primitives or integration choices."
              }
            },
            {
              "@type": "Question",
              name: "Does Cockroach Browser replace Playwright?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Cockroach Browser uses Playwright and Chromium. It adds an explicit session-authority, evidence, audit, and human-handoff boundary for agent use."
              }
            },
            {
              "@type": "Question",
              name: "Does Maqam govern every action an agent can take?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Maqam governs registered actions deliberately routed through its gateway. Calls that bypass that boundary remain outside its control."
              }
            },
            {
              "@type": "Question",
              name: "Are the established tools products by Ajnas N B?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Playwright, Puppeteer, Trafilatura, Firecrawl, Browser Use, Stagehand, LangGraph, OpenAI Agents SDK, and Docling are third-party projects maintained by their own organizations or communities."
              }
            }
          ]
        },
        breadcrumbFor(route)
      ]
    };
  }

  const article = route.startsWith("/articles/") || route.startsWith("/releases/") || route.startsWith("/docs/") || route === "/docs/";
  return {
    "@context": "https://schema.org",
    "@graph": [
      article ? {
        "@type": "TechArticle",
        headline: title,
        description,
        dateModified: modifiedDate,
        author,
        publisher,
        mainEntityOfPage: canonical,
        inLanguage: "en",
        about: { "@type": "SoftwareApplication", name: "Maqam", softwareVersion: "0.3.3", url: siteUrl }
      } : {
        "@type": "WebPage",
        name: title,
        description,
        url: canonical,
        dateModified: modifiedDate,
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", name: "Maqam", url: siteUrl },
        about: { "@type": "SoftwareApplication", name: "Maqam", softwareVersion: "0.3.3", url: siteUrl }
      },
      breadcrumbFor(route)
    ]
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
    .replace(/\s*<meta name="theme-color"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="robots"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="author"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="application-name"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="keywords"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta property="og:[^"]+"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="twitter:[^"]+"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="citation_[^"]+"[^>]*>\s*/gi, "\n")
    .replace(/\s*<meta name="DC\.[^"]+"[^>]*>\s*/gi, "\n")
    .replace(/\s*<link rel="alternate" hreflang="[^"]+"[^>]*>\s*/gi, "\n")
    .replace(/\s*<link rel="search"[^>]*>\s*/gi, "\n")
    .replace(/\s*<script type="application\/ld\+json" data-search-metadata>[\s\S]*?<\/script>\s*/gi, "\n");

  const keywords = route === "/alternatives/"
    ? "Maqam alternatives, AI agent governance comparison, TypeScript agent governance, OpenAI Agents SDK, LangGraph, OPA, Cedar, NeMo Guardrails"
    : route === "/articles/open-source-governed-agent-toolkit/"
      ? "open-source governed AI agents, Qarinah, Maqam, Cockroach Browser, Cockroach Crawler, Playwright, LangGraph, agent governance toolkit"
      : "Maqam, AI agent governance, exact approval, tool gateway, execution receipts, TypeScript";
  const metadata = [
    '  <meta name="theme-color" content="#050908">',
    '  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
    '  <meta name="author" content="Ajnas N B">',
    '  <meta name="application-name" content="Maqam">',
    `  <meta name="keywords" content="${keywords}">`,
    `  <meta property="og:type" content="${article ? "article" : "website"}">`,
    '  <meta property="og:locale" content="en_US">',
    '  <meta property="og:site_name" content="Maqam">',
    `  <meta property="og:title" content="${escapeAttribute(title)}">`,
    `  <meta property="og:description" content="${escapeAttribute(description)}">`,
    `  <meta property="og:url" content="${escapeAttribute(canonical)}">`,
    `  <meta property="og:image" content="${defaultImage}">`,
    '  <meta property="og:image:type" content="image/png">',
    '  <meta property="og:image:width" content="1586">',
    '  <meta property="og:image:height" content="992">',
    '  <meta property="og:image:alt" content="Maqam exact approval gate for governed AI agent actions">',
    '  <meta name="twitter:card" content="summary_large_image">',
    `  <meta name="twitter:title" content="${escapeAttribute(title)}">`,
    `  <meta name="twitter:description" content="${escapeAttribute(description)}">`,
    `  <meta name="twitter:image" content="${defaultImage}">`,
    '  <meta name="twitter:image:alt" content="Maqam exact approval gate for governed AI agent actions">',
    ...(route === "/paper/" ? [
      '  <meta name="citation_title" content="Maqam: Exact-Input Governance for Registered AI-Agent Actions">',
      '  <meta name="citation_author" content="Ajnas N B">',
      '  <meta name="citation_publication_date" content="2026-08-08">',
      '  <meta name="citation_doi" content="10.5281/zenodo.21851251">',
      '  <meta name="citation_technical_report_institution" content="Maqam open-source project">',
      '  <meta name="citation_pdf_url" content="https://maqamagent.com/paper/Maqam-Technical-White-Paper-v1.0.pdf">',
      '  <meta name="DC.type" content="Text.TechnicalReport">',
      '  <meta name="DC.language" content="en">'
    ] : []),
    `  <script type="application/ld+json" data-search-metadata>${schema}</script>`
  ].join("\n");

  html = html.replace(
    /\s*<link rel="canonical" href="[^"]+">/i,
    `\n${metadata}\n  <link rel="canonical" href="${escapeAttribute(canonical)}">\n  <link rel="alternate" hreflang="en" href="${escapeAttribute(canonical)}">\n  <link rel="alternate" hreflang="x-default" href="${escapeAttribute(canonical)}">\n  <link rel="search" type="application/json" href="/search.json" title="Maqam content index">`
  );
  html = ensurePaperNavigation(html, "desktop-nav");
  html = ensurePaperNavigation(html, "mobile-nav");
  html = ensureAlternativesNavigation(html, "desktop-nav", route);
  html = ensureAlternativesNavigation(html, "mobile-nav", route);
  await writeFile(file, html.replace(/\n{3,}/g, "\n\n"), "utf8");
}

console.log("Enhanced search metadata for every Maqam HTML page.");
