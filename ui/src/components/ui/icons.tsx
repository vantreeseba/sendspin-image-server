import type { LucideIcon, LucideProps } from "lucide-react";

/** What an icon takes — the name `icons.tsx` exports for its wrapped icons. */
export type IconProps = LucideProps;

/**
 * The web half of `icons.tsx`'s `icon`: there is nothing to wrap, so it hands
 * the glyph back. It exists so an app's extra glyph is the same line on both
 * platforms — `export const Archive = icon(ArchiveSource)` — in an `app-icons.tsx` that
 * imports the source from `lucide-react-native/icons/archive` and an
 * `app-icons.web.tsx` beside it that imports it from `lucide-react`.
 */
export function icon(Source: LucideIcon): LucideIcon {
  return Source;
}

export {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  File,
  FilePen,
  FileText,
  Folder,
  FolderPen,
  Info,
  KeyRound,
  Library,
  LoaderCircle,
  Lock,
  Monitor,
  Moon,
  Pause,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Square,
  Sun,
  Tag,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
