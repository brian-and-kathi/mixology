document.querySelectorAll("[data-slug-from]").forEach((slug) => {
  const source = document.getElementById(slug.dataset.slugFrom);
  if (!source) return;
  let touched = slug.value.trim() !== "";
  slug.addEventListener("input", () => {
    touched = true;
  });
  source.addEventListener("input", () => {
    if (touched) return;
    slug.value = source.value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  });
});

function searchCookieName(key) {
  return `db-search-${key}`;
}

function readCookie(name) {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  if (!match) return "";
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return "";
  }
}

function writeCookie(name, value) {
  const maxAge = value ? 60 * 60 * 24 * 365 : 0;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

document.querySelectorAll("[data-live-search]").forEach((input) => {
  const table = input.closest("main").querySelector("table");
  if (!table) return;
  const rows = [...table.querySelectorAll("tbody tr[data-search]")];
  const empty = table.querySelector("[data-filter-empty]");
  const clear = input.parentElement.querySelector("[data-search-clear]");
  const cookieName = input.dataset.searchKey ? searchCookieName(input.dataset.searchKey) : "";
  if (cookieName && input.value.trim() === "") input.value = readCookie(cookieName).slice(0, 200);
  const apply = () => {
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    rows.forEach((row) => {
      const match = query === "" || row.dataset.search.toLowerCase().includes(query);
      row.hidden = !match;
      if (match) shown += 1;
    });
    if (empty) empty.hidden = shown !== 0;
    if (clear) clear.hidden = input.value.trim() === "";
    if (cookieName) writeCookie(cookieName, input.value.trim().slice(0, 200));
  };
  input.addEventListener("input", apply);
  clear?.addEventListener("click", () => {
    input.value = "";
    apply();
    input.focus();
  });
  apply();
});

const familyList = document.querySelector("[data-family-sort]");
if (familyList) {
  let dragged = null;
  familyList.addEventListener("dragstart", (event) => {
    const search = document.querySelector("[data-live-search]");
    if (search && search.value.trim() !== "") {
      event.preventDefault();
      return;
    }
    const handle = event.target.closest(".handle");
    const row = handle?.closest("tr");
    if (!row) return;
    dragged = row;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", row.dataset.id);
  });
  familyList.addEventListener("dragover", (event) => {
    const row = event.target.closest("tr");
    if (!dragged || !row || row === dragged) return;
    event.preventDefault();
    const midpoint = row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
    row.parentNode.insertBefore(dragged, event.clientY > midpoint ? row.nextSibling : row);
  });
  familyList.addEventListener("dragend", async () => {
    if (!dragged) return;
    dragged.classList.remove("dragging");
    dragged = null;
    const body = new URLSearchParams();
    familyList.querySelectorAll("tr[data-id]").forEach((row) => body.append("ids", row.dataset.id));
    const response = await fetch("/db/families/order", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) location.reload();
  });
}

const primaryFamily = document.querySelector("#primary-family");
const alsoIn = document.querySelector("[data-also-in]");
if (primaryFamily && alsoIn) {
  const syncAlsoIn = () => {
    const chosen = primaryFamily.value;
    alsoIn.querySelectorAll('input[name="family_ids"]').forEach((box) => {
      const same = chosen !== "" && box.value === chosen;
      box.disabled = same;
      if (same) box.checked = false;
      box.title = same ? "Already chosen as the primary family" : "";
    });
  };
  primaryFamily.addEventListener("change", syncAlsoIn);
  syncAlsoIn();
}

const flavoring = document.querySelector("#spec-flavoring");
if (primaryFamily && flavoring) {
  let held = flavoring.value;
  const syncFlavoring = () => {
    const option = primaryFamily.selectedOptions[0];
    const allowed = option?.dataset.allowsFlavoring === "true";
    if (allowed) {
      flavoring.disabled = false;
      if (flavoring.value === "" && held) flavoring.value = held;
      return;
    }
    if (!flavoring.disabled) held = flavoring.value;
    flavoring.disabled = true;
    flavoring.value = "";
  };
  primaryFamily.addEventListener("change", syncFlavoring);
  syncFlavoring();
}

const lineTable = document.querySelector("[data-lines]");
const addLine = document.querySelector("[data-add-line]");

if (lineTable && addLine) {
  addLine.addEventListener("click", () => {
    const rows = lineTable.querySelectorAll("[data-line]");
    const copy = rows[rows.length - 1].cloneNode(true);
    const next = rows.length;
    copy.querySelectorAll("input, select, textarea").forEach((el) => {
      el.name = el.name.replace(/lines\[\d+]/, `lines[${next}]`);
      if (el.type === "checkbox") el.checked = el.name.endsWith("[required]");
      else if (el.name.endsWith("[position]")) el.value = String(next + 1);
      else el.value = "";
    });
    lineTable.appendChild(copy);
  });

  lineTable.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-line]");
    if (!button) return;
    const row = button.closest("[data-line]");
    const rows = lineTable.querySelectorAll("[data-line]");
    if (rows.length === 1) {
      row.querySelectorAll("input, select, textarea").forEach((el) => {
        if (el.type === "checkbox") el.checked = el.name.endsWith("[required]");
        else if (el.name.endsWith("[position]")) el.value = "1";
        else el.value = "";
      });
      return;
    }
    row.remove();
  });
}

const flagTip = document.createElement("div");
flagTip.className = "flag-tip";
flagTip.hidden = true;
document.body.appendChild(flagTip);

function placeFlagTip(cell) {
  flagTip.textContent = cell.dataset.tip;
  flagTip.hidden = false;
  const rect = cell.getBoundingClientRect();
  const tip = flagTip.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - tip.width - 8));
  let top = rect.bottom + 6;
  if (top + tip.height > window.innerHeight - 8) top = Math.max(8, rect.top - tip.height - 6);
  flagTip.style.left = `${left}px`;
  flagTip.style.top = `${top}px`;
}

function hideFlagTip() {
  flagTip.hidden = true;
}

document.querySelectorAll("th.flag[data-tip], td.flag[data-tip]").forEach((cell) => {
  cell.addEventListener("mouseenter", () => placeFlagTip(cell));
  cell.addEventListener("mouseleave", hideFlagTip);
});
window.addEventListener("scroll", hideFlagTip, true);

const dbMenu = document.querySelector("[data-db-menu]");
if (dbMenu) {
  const dbMenuButton = dbMenu.querySelector("button");
  const dbMenuPanel = dbMenu.querySelector("[data-db-menu-panel]");
  const closeDbMenu = () => {
    dbMenuPanel.hidden = true;
    dbMenuButton.setAttribute("aria-expanded", "false");
  };
  dbMenuButton.addEventListener("click", () => {
    const open = dbMenuPanel.hidden;
    dbMenuPanel.hidden = !open;
    dbMenuButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) dbMenuPanel.querySelector("a, button")?.focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!dbMenu.contains(event.target)) closeDbMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dbMenuPanel.hidden) {
      event.preventDefault();
      closeDbMenu();
      dbMenuButton.focus();
    }
  });
  dbMenu.addEventListener("focusout", (event) => {
    if (!dbMenuPanel.hidden && event.relatedTarget && !dbMenu.contains(event.relatedTarget)) closeDbMenu();
  });
}
