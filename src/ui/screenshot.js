/**
 * The file name of a map screenshot. Characters that are unsafe in file names become "_".
 *
 * @param seed    {string} the map seed
 * @param width   {Number} image width in pixels
 * @param height  {Number} image height in pixels
 * @returns {string} e.g. "hodos-12345-800x600.png"
 */
export const screenshotFileName = (seed, width, height) => {
  const safeSeed =
    String(seed)
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .slice(0, 64) || "map";
  return `hodos-${safeSeed}-${width}x${height}.png`;
};

/**
 * Makes the browser download a blob as a file.
 */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
