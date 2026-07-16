# Maqam crawler governed-research overview transcript

Maqam's crawler is a bounded HTTP and HTML research connector, not a browser automation fleet.

A run starts with seeds and ceilings for pages, requests, queue size, depth, bytes, retries, concurrency, and duration.

Maqam validates origins, resolves and pins public addresses, checks each redirect, and respects robots dot text by default.

Same-origin discovery is the default. Cross-origin work needs trusted scope. Private networks require host opt-in, while link-local and other unsafe ranges stay blocked.

Each page returns normalized URL, title, heading, text, markdown, links, response metadata, redirect history, and a content hash.

Detailed mode adds failures and statistics. The governed wrapper declares a network-read effect and enforces deployment limits.

Through ToolGateway, calls receive policy, call ceilings, exact approvals when configured, redacted trace, and scoped evidence.

It does not execute page JavaScript, defeat anti-bot systems, or prove a source is true. Use a browser provider when rendering is required.

## Source basis

This narration is based on Maqam's crawler implementation, CLI help, usage guide, `createCrawlerTool()` wrapper, and crawler security/limit tests as inspected on 2026-07-16. The video does not claim browser rendering, anti-bot bypass, semantic truth verification, unrestricted private-network access, or a hosted crawler fleet.
