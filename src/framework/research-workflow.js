function candidateNameFromPage(page) {
  if (page.title) return page.title.replace(/\s*[-|].*$/, "").trim();
  const url = new URL(page.url);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.at(-1) || url.hostname;
}

export function createResearchWorkflow(options = {}) {
  const seeds = options.seeds || [];
  const maxPages = options.maxPages || 10;

  return {
    name: "enterprise_research",
    tasks: [
      {
        id: "collect_sources",
        retries: 1,
        run: async (context) => {
          const pages = await context.tools.call("crawler", {
            seeds,
            maxPages,
            sameOrigin: options.sameOrigin ?? true,
            includeSitemaps: options.includeSitemaps ?? false
          }, context);

          const evidenceIds = pages.map((page) => {
            const evidence = context.evidence.addEvidence({
              runId: context.runId,
              taskId: "collect_sources",
              sourceType: "url",
              source: page.url,
              excerpt: page.text || page.markdown || page.title || "",
              tool: "crawler",
              confidence: page.status === 200 ? 0.85 : 0.5
            });
            return evidence.evidenceId;
          });

          return { pages, evidenceIds };
        }
      },
      {
        id: "synthesize_report",
        run: async (context) => {
          const collected = context.outputs.collect_sources || { pages: [], evidenceIds: [] };
          const candidates = collected.pages.map((page, index) => {
            const evidenceId = collected.evidenceIds[index];
            const name = candidateNameFromPage(page);
            context.evidence.addClaim({
              runId: context.runId,
              taskId: "synthesize_report",
              text: `${name} was inspected from ${page.url}.`,
              evidenceIds: [evidenceId],
              confidence: 0.8
            });

            return {
              name,
              url: page.url,
              whatItDoes: page.description || page.text?.slice(0, 240) || page.title || "",
              whyUseful: "Potential source or reference for enterprise agent framework capabilities.",
              risks: ["Requires license and maintenance review before reuse."],
              recommendation: "inspiration_first",
              evidenceIds: [evidenceId]
            };
          });

          return { candidates };
        }
      },
      {
        id: "quality_checks",
        run: async (context) => ({
          unsupportedClaims: context.evidence.unsupportedClaims(),
          evidenceCount: context.evidence.listEvidence().length
        })
      }
    ]
  };
}
