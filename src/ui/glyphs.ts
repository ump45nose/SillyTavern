import {
  ArrowRightLeft,
  Binary,
  Bookmark,
  Braces,
  Captions,
  ChevronRight,
  Copy,
  Database,
  Download,
  FilePlus,
  Folder,
  FolderPlus,
  Image,
  KeyRound,
  Languages,
  Link,
  Minus,
  NotebookPen,
  Paperclip,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Tag,
  TextSearch,
  Trash2,
  Upload,
  Volume2,
  WandSparkles,
  type LucideIcon,
} from "./icons";

/** A pattern tested against a lower-cased key, and the icon it gives. */
export type GlyphRule = readonly [RegExp, LucideIcon];

/** The icon of the first rule matching `key`, in table order. */
export function glyphFor(key: string, rules: readonly GlyphRule[], fallback: LucideIcon) {
  return rules.find(([pattern]) => pattern.test(key))?.[1] ?? fallback;
}

/** Composer tools by id and label: SillyTavern's own buttons and extension menu items. */
export const toolGlyphs: readonly GlyphRule[] = [
  [/bank|manageattachments/, Database],
  [/toggle_an|作者注释/, NotebookPen],
  [/cfg|logprobs/, SlidersHorizontal],
  [/new_bookmark/, Bookmark],
  [/back_to_main/, ChevronRight],
  [/attach|file/, Paperclip],
  [/caption/, Captions],
  [/sd_gen|image|gallery/, Image],
  [/tts|narrate/, Volume2],
  [/translate/, Languages],
  [/token/, Binary],
  [/prompt|提示词/, TextSearch],
  [/variable|变量/, Braces],
  [/日志|log/, ScrollText],
];

/** Native buttons on the connection page by id, class, title and data-action. */
export const actionGlyphs: readonly GlyphRule[] = [
  [/delete|trash|remove/, Trash2],
  [/import|upload/, Upload],
  [/export|download/, Download],
  [/new|create|add/, Plus],
  [/refresh|update/, RefreshCw],
  [/restore|reset/, RotateCcw],
  [/copy|duplicate/, Copy],
  [/save/, Save],
  [/rename|edit/, PencilLine],
  [/key|secret/, KeyRound],
  [/audio|sound/, Volume2],
];

const faGlyphs = new Map<string, LucideIcon>([
  ["fa-plus", Plus],
  ["fa-minus", Minus],
  ["fa-pencil", PencilLine],
  ["fa-pen", PencilLine],
  ["fa-pen-to-square", PencilLine],
  ["fa-trash", Trash2],
  ["fa-trash-can", Trash2],
  ["fa-copy", Copy],
  ["fa-clone", Copy],
  ["fa-truck-arrow-right", ArrowRightLeft],
  ["fa-scissors", Scissors],
  ["fa-file-import", Upload],
  ["fa-upload", Upload],
  ["fa-file-arrow-up", Upload],
  ["fa-file-export", Download],
  ["fa-download", Download],
  ["fa-file-arrow-down", Download],
  ["fa-floppy-disk", Save],
  ["fa-save", Save],
  ["fa-file-circle-plus", FilePlus],
  ["fa-folder-plus", FolderPlus],
  ["fa-folder", Folder],
  ["fa-rotate", RefreshCw],
  ["fa-arrows-rotate", RefreshCw],
  ["fa-sync", RefreshCw],
  ["fa-clock-rotate-left", RotateCcw],
  ["fa-rotate-left", RotateCcw],
  ["fa-undo", RotateCcw],
  ["fa-recycle", RotateCcw],
  ["fa-link", Link],
  ["fa-key", KeyRound],
  ["fa-gear", Settings],
  ["fa-cog", Settings],
  ["fa-tags", Tag],
  ["fa-wand-magic", WandSparkles],
  ["fa-wand-magic-sparkles", WandSparkles],
  ["fa-right-left", ArrowRightLeft],
]);

/** The icon drawn for a native control's Font Awesome class: the first of its classes that has one. */
export function glyphOf(classList: Iterable<string>) {
  for (const name of classList) {
    const icon = faGlyphs.get(name);
    if (icon) return icon;
  }
}
