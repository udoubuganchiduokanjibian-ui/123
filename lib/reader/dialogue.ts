const sentenceParts = new Intl.Segmenter("zh-CN", { granularity: "sentence" });
const wordParts = new Intl.Segmenter("zh-CN", { granularity: "word" });
const maxLineLength = 30;

export function splitSpokenLines(text: string, character?: string): string[] {
  const name = character?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const speaker = [name, "他", "她"].filter(Boolean).join("|");
  const direction = new RegExp(`^(?:${speaker})(?:顿了|停了|迟疑|沉默|盯着|看了|低头|抬起头|皱了|压低声音|低声|轻声|说道|问道)`, "u");
  const result: string[] = [];
  for (const { segment } of sentenceParts.segment(text)) {
    let line = segment.trim();
    if (/^(?:判断过程|推理过程|内心独白|动作旁白|旁白)[：:]/u.test(line)) continue;
    if (direction.test(line)) {
      const directSpeech = line.search(/[“「『]/u);
      if (directSpeech === -1) continue;
      line = line.slice(directSpeech);
    }
    // Sentence boundaries can separate the opening quote from the stage direction.
    line = line.replace(/^(?:“([^“”]*)”|「([^「」]*)」|『([^『』]*)』)$/u, "$1$2$3");
    if (!/[“「『]/u.test(line)) line = line.replace(/[”」』]+$/u, "");
    if (/^[“”「」『』]*$/u.test(line)) continue;
    let chars = Array.from(line);
    while (chars.length > maxLineLength) {
      const head = chars.slice(0, maxLineLength);
      const punctuation = head.findLastIndex(char => /[，、；：,;:]/u.test(char)) + 1;
      let end = punctuation >= 10 ? punctuation : 0;
      if (!end) {
        for (const { segment: word, index } of wordParts.segment(chars.join(""))) {
          const boundary = Array.from(line.slice(0, index)).length + Array.from(word).length;
          if (boundary > maxLineLength) break;
          end = boundary;
        }
      }
      const chunk = chars.splice(0, end || maxLineLength).join("").trim();
      if (chunk) result.push(chunk);
      line = chars.join("");
    }
    if (line.trim()) result.push(line.trim());
  }
  return result;
}
