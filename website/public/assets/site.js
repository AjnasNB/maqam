const on = (element, event, handler) => element?.addEventListener(event, handler);

const liveRegion = document.querySelector("[data-live-region]");
const announce = (message) => {
  if (!liveRegion) return;
  liveRegion.textContent = "";
  window.setTimeout(() => {
    liveRegion.textContent = message;
  }, 20);
};

const fallbackCopy = (value) => {
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  return copied;
};

document.querySelectorAll("[data-copy]").forEach((button) => {
  on(button, "click", async () => {
    const selector = button.getAttribute("data-copy");
    const target = selector ? document.querySelector(selector) : button.closest(".code-shell")?.querySelector("code");
    const value = target?.textContent?.trim();
    if (!value) return;

    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      copied = fallbackCopy(value);
    }

    const original = button.textContent;
    button.textContent = copied ? "Copied" : "Select code";
    announce(copied ? "Code copied to clipboard." : "Copy was blocked. Select the code manually.");
    window.setTimeout(() => {
      button.textContent = original;
    }, 1600);
  });
});

const setupToggle = (buttonSelector, panelSelector) => {
  const button = document.querySelector(buttonSelector);
  const panel = document.querySelector(panelSelector);
  if (!button || !panel) return;

  const close = () => {
    button.setAttribute("aria-expanded", "false");
    panel.hidden = true;
  };

  on(button, "click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    panel.hidden = open;
  });

  panel.querySelectorAll("a").forEach((link) => on(link, "click", close));
  on(document, "keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      close();
      button.focus();
    }
  });
};

setupToggle("[data-nav-toggle]", "[data-mobile-nav]");
setupToggle("[data-docs-toggle]", "[data-docs-drawer]");

document.querySelectorAll("video[data-proof-video]").forEach((video) => {
  const statusId = video.getAttribute("aria-describedby");
  const status = statusId ? document.getElementById(statusId) : video.closest("[data-video-block]")?.querySelector("[data-video-status]");
  const markReady = () => {
    if (!status || !Number.isFinite(video.duration)) return;
    status.textContent = `Video ready. Duration: ${Math.round(video.duration)} seconds.`;
  };
  on(video, "loadedmetadata", markReady);
  on(video, "error", () => {
    if (status) status.textContent = "The release video could not be loaded. Retry or open this page in a browser with MP4 support.";
  });
  if (video.readyState >= 1) markReady();
});
