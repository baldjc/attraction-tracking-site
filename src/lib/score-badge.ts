export function getScoreBadgeClasses(score: number): string {
  if (score >= 7) return "bg-[#e8f7ff] text-[#0ea5d9]";
  if (score >= 5) return "bg-[#fef3c7] text-amber-700";
  return "bg-[#ffe5ea] text-[#cc0029]";
}

export function parseOverallScore(markdown: string): number | null {
  if (!markdown) return null;
  const patterns = [
    /\*\*Overall Score:?\*\*\s*\[?\s*(\d+(?:\.\d+)?)\s*\/\s*10/i,
    /Overall Score:?\s*\*?\*?\s*(\d+(?:\.\d+)?)\s*\/\s*10/i,
    /\*\*Score:?\*\*\s*(\d+(?:\.\d+)?)\s*\/\s*10/i,
  ];
  for (const re of patterns) {
    const m = markdown.match(re);
    if (m) {
      const n = parseFloat(m[1]);
      if (!isNaN(n) && n >= 0 && n <= 10) return n;
    }
  }
  return null;
}
