const pageOrder = [
  { path: "/audio/", name: "Audio" },
  { path: "/lyrics/video/", name: "Video Lyrics" },
  { path: "/lyrics/vtt/", name: "VTT Lyrics" },
  { path: "/lyrics/json/", name: "JSON Lyrics" },
  { path: "/visuals/", name: "Visuals" },
  { path: "/karaoke/", name: "Karaoke" },
];

const themeStorageKey = "karaoke-theme";

function getPreferredTheme() {
  const storedTheme = localStorage.getItem(themeStorageKey);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem(themeStorageKey, theme);
}

applyTheme(getPreferredTheme());

class PageOrderMenu extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.shadowRoot.childElementCount > 0) {
      return;
    }

    const currentPage = window.location.pathname
      .replace(/\/index\.html$/, "")
      .replace(/\/?$/, "/");
    const navigation = document.createElement("nav");
    navigation.setAttribute("aria-label", "Page navigation");

    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        z-index: 1000;
        right: 16px;
        bottom: 16px;
        left: 16px;
        display: flex;
        justify-content: center;
        pointer-events: none;
      }

      nav {
        display: flex;
        max-width: 100%;
        gap: 6px;
        overflow-x: auto;
        padding: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 999px;
        background: rgba(25, 25, 25, 0.92);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        pointer-events: auto;
        scrollbar-width: none;
        backdrop-filter: blur(12px);
      }

      .theme-toggle {
        width: 38px;
        padding-inline: 0;
        font-size: 16px;
      }

      nav::-webkit-scrollbar {
        display: none;
      }

      button {
        flex: 0 0 auto;
        padding: 9px 14px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #f5f2ec;
        font: 600 14px/1.2 system-ui, sans-serif;
        cursor: pointer;
      }

      button:hover,
      button:focus-visible {
        background: rgba(255, 255, 255, 0.14);
      }

      button[aria-current="page"] {
        background: #ffd074;
        color: #211f1c;
      }

      button:focus-visible {
        outline: 2px solid #ffd074;
        outline-offset: 2px;
      }
    `;

    for (const page of pageOrder) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = page.name;
      if (page.path === currentPage) {
        button.setAttribute("aria-current", "page");
      }
      button.addEventListener("click", () => {
        window.location.href = page.path;
      });
      navigation.append(button);
    }

    const themeToggle = document.createElement("button");
    themeToggle.type = "button";
    themeToggle.className = "theme-toggle";
    themeToggle.addEventListener("click", () => {
      const nextTheme =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      updateThemeToggle();
    });

    const updateThemeToggle = () => {
      const isDark = document.documentElement.dataset.theme === "dark";
      themeToggle.textContent = isDark ? "☀" : "☾";
      themeToggle.setAttribute(
        "aria-label",
        isDark ? "Switch to light mode" : "Switch to dark mode",
      );
      themeToggle.setAttribute("aria-pressed", String(isDark));
      themeToggle.title = isDark
        ? "Switch to light mode"
        : "Switch to dark mode";
    };

    updateThemeToggle();
    navigation.append(themeToggle);

    this.shadowRoot.append(style, navigation);
  }
}

if (!customElements.get("page-order-menu")) {
  customElements.define("page-order-menu", PageOrderMenu);
}

if (!document.querySelector("page-order-menu")) {
  document.body.append(document.createElement("page-order-menu"));
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "p" && event.key !== "n") {
    return;
  }

  const currentPage = window.location.pathname
    .replace(/\/index\.html$/, "")
    .replace(/\/?$/, "/");
  const currentIndex = pageOrder.findIndex((page) => page.path === currentPage);
  const direction = event.key === "n" ? 1 : -1;
  const destination = pageOrder[currentIndex + direction];

  if (currentIndex >= 0 && destination) {
    console.info(`Navigating to: ${destination.name}`);
    window.location.href = destination.path;
  }
});
