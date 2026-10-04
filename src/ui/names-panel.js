import { LABEL_KINDS, isEmpty, withKindShown } from "../state/edits.js";
import { labelText } from "../overlay/label-text.js";
import { t } from "../i18n/i18n.js";
import { openArea, screenToWorld } from "../map/view.js";
import { TAP_DISTANCE } from "./hover.js";
import { setupNamesFile } from "./names-file.js";
import { setupNamesEditor } from "./names-editor.js";
import { KIND_ORDER, groupLabels } from "./names-list.js";

/**
 * The names panel: the map's place names by kind, a search, which kinds show on the map, and
 * (see names-editor.js and names-file.js) the editor of the selected name and its file. It does
 * not cover the map's controls' use: the map pans and zooms while it is open.
 *
 * @param labelEdits {LabelEdits} see state/label-edits-store.js
 * @param labelLayer {LabelLayer}
 * @param worldMap {WorldMap}
 * @param currentState {function} see url-state.js
 * @param urlSync {{syncNow: function}} see url-sync.js
 * @returns {{select: function(string|null), refresh: function}}
 */
export function setupNamesPanel({ labelEdits, labelLayer, worldMap, currentState, urlSync }) {
  const panel = document.getElementById("names-panel");
  const button = document.getElementById("names-button");
  const search = document.getElementById("names-search");
  const kinds = document.getElementById("names-kinds");
  const list = document.getElementById("names-list");
  const unfiled = document.getElementById("names-unfiled");
  const editor = setupNamesEditor(labelEdits);
  setupNamesFile({ labelEdits, currentState, urlSync });
  // The groups the user opened, kept across rebuilds of the list
  const openKinds = new Set();

  const isOpen = () => !panel.hidden;

  // One checkbox per kind, in the list's order
  const kindBoxes = new Map();
  for (const kind of KIND_ORDER.filter((k) => LABEL_KINDS.includes(k))) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.addEventListener("change", () => {
      labelEdits.update((edits) => withKindShown(edits, kind, box.checked));
    });
    const name = document.createElement("span");
    name.dataset.i18n = `names.kind.${kind}`;
    name.textContent = t(`names.kind.${kind}`);
    label.append(box, " ", name);
    kinds.append(label);
    kindBoxes.set(kind, box);
  }

  const entryOf = ({ label, text }) => {
    const item = document.createElement("li");
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "names-entry";
    entry.dataset.id = label.id;
    entry.textContent = text;
    entry.setAttribute("aria-current", String(label.id === labelLayer.selected));
    for (const [flag, mark, key] of [
      [label.edited, "✎", "names.renamed"],
      [label.hidden, "⊘", "names.hiddenMark"],
    ]) {
      if (!flag) continue;
      const span = document.createElement("span");
      span.className = "names-mark";
      span.textContent = mark;
      span.title = t(key);
      span.setAttribute("aria-label", t(key));
      entry.append(span);
    }
    entry.addEventListener("click", () => panelApi.select(label.id, { focus: true }));
    item.append(entry);
    return item;
  };

  const refresh = () => {
    if (!isOpen()) return;
    for (const [kind, box] of kindBoxes) box.checked = labelEdits.edits.kinds[kind] !== false;
    const searching = search.value.trim() !== "";
    const groups = groupLabels(labelEdits.labels, labelText, search.value);
    const nodes = groups.map(({ kind, entries }) => {
      const details = document.createElement("details");
      details.open =
        searching || openKinds.has(kind) || entries.some((e) => e.label.id === labelLayer.selected);
      details.addEventListener("toggle", () => {
        if (searching) return;
        if (details.open) openKinds.add(kind);
        else openKinds.delete(kind);
      });
      const summary = document.createElement("summary");
      summary.textContent = t("names.group", { kind: t(`names.kind.${kind}`), n: entries.length });
      const items = document.createElement("ul");
      items.append(...entries.map(entryOf));
      details.append(summary, items);
      return details;
    });
    list.replaceChildren(...nodes);
    unfiled.hidden = labelEdits.filed || isEmpty(labelEdits.edits);
    editor.show(labelLayer.selected);
  };

  const setOpen = (open) => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) refresh();
    else panelApi.select(null);
  };

  const panelApi = {
    /**
     * Selects a label by id, or none, and shows it in the editor. With focus, the map flies to
     * it, at the first zoom where it shows, in the part of the map the panel leaves open.
     */
    select(id, { focus = false } = {}) {
      labelLayer.selected = id;
      editor.show(id);
      refresh();
      const label = id && labelEdits.labels.find((l) => l.id === id);
      if (label && focus) {
        const canvas = worldMap.renderer.canvas.getBoundingClientRect();
        const open = openArea(canvas, panel.getBoundingClientRect());
        const { x, y, zoom } = labelLayer.focus(label, open);
        worldMap.controller.setView(x, y, zoom);
      }
      list.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
    },
    refresh,
    isOpen,
  };

  button.addEventListener("click", () => setOpen(!isOpen()));
  document.getElementById("names-close").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen() && !document.querySelector("dialog[open]"))
      setOpen(false);
  });
  search.addEventListener("input", refresh);
  labelEdits.addListener(refresh);
  // After the language switch of language.js, registered before: the list's texts change
  document.getElementById("language-select").addEventListener("change", refresh);

  // A click or tap on the map, not a drag, selects the name there: a label drawn there first (a
  // river's name is beside the river), then the feature under it, then its land mass
  const mapElement = document.getElementById("map");
  const presses = new Map();
  mapElement.addEventListener("pointerdown", (event) => {
    if (!isOpen() || event.target.closest("button")) return;
    presses.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // A second finger is a pinch: no press is a tap any more
    if (presses.size > 1) presses.clear();
  });
  mapElement.addEventListener("pointercancel", (event) => presses.delete(event.pointerId));
  document.addEventListener("pointerup", (event) => {
    const start = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    if (!start || !isOpen() || worldMap.sampler === undefined) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_DISTANCE) return;
    const rect = worldMap.renderer.canvas.getBoundingClientRect();
    const [x, y] = [event.clientX - rect.left, event.clientY - rect.top];
    const drawn = labelLayer.labelAt(x, y);
    if (drawn) {
      panelApi.select(drawn.id);
      return;
    }
    const point = screenToWorld(worldMap.camera.view, x, y);
    const { feature, landmass } = worldMap.namesAt(point.x, point.y);
    panelApi.select((feature ?? landmass)?.id ?? null);
  });

  return panelApi;
}
