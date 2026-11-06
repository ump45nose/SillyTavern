import {
  FileOutput,
  Lightbulb,
  MessagesSquare,
  Play,
  Puzzle,
  RotateCcw,
  Table2,
  UserRoundPen,
  type LucideIcon,
} from "./icons";
import { glyphFor, toolGlyphs } from "./glyphs";
import { actionLabels } from "../host/labels";
export const composerTools = [
  { id: "builtin:continue", label: actionLabels.continue },
  { id: "builtin:regenerate", label: actionLabels.regenerate },
  { id: "builtin:quick", label: "快速回复" },
  { id: "builtin:impersonate", label: actionLabels.impersonate },
  { id: "builtin:attachment", label: "附件" },
  { id: "builtin:options", label: "剧情选项" },
  { id: "builtin:database", label: "数据库" },
];
/** The built-in tools on screen: 数据库 only while its plug-in is installed. */
export const builtinTools = (database: boolean) =>
  composerTools.filter((tool) => tool.id !== "builtin:database" || database);
const builtinGlyphs = new Map<string, LucideIcon>([
  ["builtin:continue", Play],
  ["builtin:regenerate", RotateCcw],
  ["builtin:quick", MessagesSquare],
  ["builtin:impersonate", UserRoundPen],
  ["builtin:options", Lightbulb],
  ["builtin:database", Table2],
  ["wb:export", FileOutput],
]);
export function toolIcon(id: string, label = "") {
  return builtinGlyphs.get(id) ?? glyphFor((id + " " + label).toLowerCase(), toolGlyphs, Puzzle);
}
