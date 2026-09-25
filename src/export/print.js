import { canvasToBlob } from "./export.js";

/**
 * Prints are rendered with their longest side at this size: about 190 dpi on 3×3 A4 sheets.
 */
export const PRINT_SIDE = 4096;

/**
 * How much neighbouring pages overlap, as a share of a page, so sheets can be trimmed and glued.
 */
export const PAGE_OVERLAP = 0.05;

/**
 * Cuts an image into n × n overlapping pieces, row by row from the top left.
 * The last row and column end exactly on the image's edges.
 */
export function pageRects(width, height, n, overlap = PAGE_OVERLAP) {
  const pieceWidth = width / (n - (n - 1) * overlap);
  const pieceHeight = height / (n - (n - 1) * overlap);
  const rects = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const x = Math.round(col * pieceWidth * (1 - overlap));
      const y = Math.round(row * pieceHeight * (1 - overlap));
      rects.push({
        row,
        col,
        x,
        y,
        width: col === n - 1 ? width - x : Math.round(pieceWidth),
        height: row === n - 1 ? height - y : Math.round(pieceHeight),
      });
    }
  }
  return rects;
}

/**
 * The export size of a print, see export.js exportView.
 */
export const printSize = (area, screenView) =>
  area === "world" ? PRINT_SIDE : PRINT_SIDE / Math.max(screenView.width, screenView.height);

/**
 * Prints an image on n × n pages through the browser's print dialog.
 * The pages only exist while printing: they are removed after it.
 *
 * @param canvas      {HTMLCanvasElement} the image to print
 * @param n           {Number} pages per side
 * @param captionFor  {function({page, pages, row, col}): string} the caption of a page, 1-based
 */
export async function printImage(canvas, n, captionFor) {
  const rects = pageRects(canvas.width, canvas.height, n);
  const container = document.createElement("div");
  container.id = "print-container";
  const urls = [];
  // Everything below can fail midway (a piece's encoding, an image's decode): if it does, the
  // container (whether or not it was appended yet) and every URL created so far must be cleaned
  // up before the failure is rethrown, so the caller's failure handling isn't left with a stray
  // container or leaked object URLs.
  try {
    for (const [index, rect] of rects.entries()) {
      const piece = document.createElement("canvas");
      piece.width = rect.width;
      piece.height = rect.height;
      piece
        .getContext("2d")
        .drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      const url = URL.createObjectURL(await canvasToBlob(piece));
      urls.push(url);
      const page = document.createElement("section");
      page.className = "print-page";
      const image = document.createElement("img");
      image.src = url;
      image.alt = "";
      const caption = document.createElement("p");
      // Set once and never retranslated: this container only exists for the duration of a print,
      // so a language switch while it is up would have nothing meaningful to update.
      caption.textContent = captionFor({
        page: index + 1,
        pages: rects.length,
        row: rect.row + 1,
        col: rect.col + 1,
      });
      page.append(image, caption);
      container.append(page);
    }
    document.getElementById("print-container")?.remove();
    document.body.append(container);
    await Promise.all([...container.querySelectorAll("img")].map((image) => image.decode()));
  } catch (error) {
    container.remove();
    for (const url of urls) URL.revokeObjectURL(url);
    throw error;
  }
  window.addEventListener(
    "afterprint",
    () => {
      container.remove();
      for (const url of urls) URL.revokeObjectURL(url);
    },
    { once: true },
  );
  window.print();
}
