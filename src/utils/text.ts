export function countWords(content: string) {
  return Array.from(content.replace(/\s/g, "")).length;
}

export function formatChapterContent(content: string) {
  return content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\u3000]+$/g, "").trim())
    .reduce<string[]>((lines, line) => {
      if (!line) {
        if (lines.length > 0 && lines[lines.length - 1] !== "") {
          lines.push("");
        }
        return lines;
      }

      const formattedLine = line.replace(/^[\u3000\s]+/, "");
      lines.push(`　　${formattedLine}`);
      return lines;
    }, [])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
