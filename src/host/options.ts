/** Story options: the pure rules, free of the DOM and of SillyTavern. */

export interface StoryOption {
  title: string;
  /** Empty when the title is all there is. */
  detail: string;
}

const BLOCK = /<options\b[^>]*>[\s\S]*?<\/options>/gi;
const OPEN = "<options";
const MAX = 6;

function decode(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** The options of the last complete `<options>` block a reply carries. */
export function parseOptions(raw: string): StoryOption[] {
  const block = [...raw.matchAll(BLOCK)].at(-1)?.[0];
  if (!block) return [];
  return [...block.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map(([, attributes, body]) => {
      const title = decode(
          attributes
            .match(/title\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
            ?.slice(1)
            .find((x) => x != null) ?? "",
        ).trim(),
        detail = decode(body).trim();
      return title ? { title, detail } : { title: detail, detail: "" };
    })
    .filter((option) => option.title)
    .slice(0, MAX);
}

/**
 * The reply as a reader sees it: every complete block out, and a block still streaming at the end
 * (or its opening tag half written) out too.
 */
export function stripOptions(text: string) {
  let out = text.replace(BLOCK, "");
  const open = out.search(/<options\b[^>]*>(?![\s\S]*<\/options>)/i);
  if (open >= 0) out = out.slice(0, open);
  else {
    const tail = out.slice(out.lastIndexOf("<"));
    if (tail.length > 1 && OPEN.startsWith(tail.toLowerCase())) out = out.slice(0, -tail.length);
  }
  return out === text ? text : out.replace(/\s+$/, "");
}

/**
 * A text-completion prompt without the options of earlier replies. The instruction asking for them
 * sits at depth 0, after every reply, so its example block is the last one and stays.
 */
export function stripHistory(prompt: string, keepLast: boolean) {
  const blocks = [...prompt.matchAll(BLOCK)];
  if (!blocks.length) return prompt;
  const keep = keepLast ? blocks.at(-1)!.index : -1;
  return prompt.replace(BLOCK, (block, at: number) => (at === keep ? block : ""));
}

/** One table as the database plug-in exports it: a header row, then the rows. */
export interface Sheet {
  name?: string;
  content?: unknown[][];
}

const cell = (value: unknown) => (value == null ? "" : String(value).trim());

/**
 * A table's rows as options. One row: each filled cell is an option (a column per option). Several
 * rows: each row is one, titled by its first filled column, the rest as `header：value` lines.
 */
export function tableOptions(sheet: Sheet): StoryOption[] {
  const [header = [], ...rows] = Array.isArray(sheet.content) ? sheet.content : [];
  const columns = header
    .map((name, index) => ({ name: cell(name), index }))
    .filter((column) => column.name && column.name.toLowerCase() !== "row_id");
  const filled = rows.filter((row) => Array.isArray(row) && columns.some((c) => cell(row[c.index])));
  if (filled.length === 1)
    return columns
      .map((c) => cell(filled[0][c.index]))
      .filter(Boolean)
      .map((title) => ({ title, detail: "" }))
      .slice(0, MAX);
  return filled
    .map((row) => {
      const values = columns.map((c) => ({ name: c.name, value: cell(row[c.index]) })).filter((x) => x.value);
      return {
        title: values[0]?.value ?? "",
        detail: values
          .slice(1)
          .map((x) => `${x.name}：${x.value}`)
          .join("\n"),
      };
    })
    .filter((option) => option.title)
    .slice(0, MAX);
}

/** The tables of an export, by name; the export is an object of tables plus bookkeeping entries. */
export function sheets(exported: unknown): Sheet[] {
  if (!exported || typeof exported !== "object") return [];
  return Object.values(exported as Record<string, unknown>).filter(
    (value): value is Sheet =>
      !!value &&
      typeof value === "object" &&
      typeof (value as Sheet).name === "string" &&
      Array.isArray((value as Sheet).content),
  );
}

/** The instruction injected while a chat takes its options from the model's replies. */
export const DEFAULT_OPTIONS_PROMPT = [
  "[剧情选项] 正文写完后，另起一行输出 3–4 个供 {{user}} 选择的下一步行动，格式如下，整段只出现一次：",
  '<options><option title="四到十个字的标题">一两句话：这个行动是什么、可能把故事带向哪里</option></options>',
  "选项要贴合故事当前的文风与 {{char}} 的处境，方向彼此不同。下面是作者的主线，为空时忽略；有内容时至少一个选项推动它：",
  "{{outline}}",
].join("\n");
