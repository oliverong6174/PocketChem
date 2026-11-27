/** The SVG's own size: its width and height attributes, else its viewBox. Used for proportions only; the markup itself is never rewritten. */
export function svgIntrinsicSize(svg: string): { width: number; height: number } {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const num = (name: string) => {
    const match = new RegExp(`\\s${name}\\s*=\\s*['"]\\s*([0-9.]+)(?:px)?\\s*['"]`, "i").exec(tag);
    return match ? Number.parseFloat(match[1]) : null;
  };
  const box = /viewBox\s*=\s*['"]\s*([-0-9.eE]+)[\s,]+([-0-9.eE]+)[\s,]+([-0-9.eE]+)[\s,]+([-0-9.eE]+)\s*['"]/i.exec(tag);
  const width = num("width") ?? (box ? Number.parseFloat(box[3]) : 400);
  const height = num("height") ?? (box ? Number.parseFloat(box[4]) : 300);
  return { width: width > 0 ? width : 400, height: height > 0 ? height : 300 };
}
