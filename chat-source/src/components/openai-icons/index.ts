// Selected icons vendored unchanged from openai/apps-sdk-ui (MIT).
// Source and revision: ../../../../docs/README.md (openai-icons section); LICENSE remains here.
import type { ComponentType, SVGProps } from "react";
import Archive from "./Archive";
import ArrowUp from "./ArrowUp";
import BookClosed from "./BookClosed";
import Branch from "./Branch";
import Chat from "./Chat";
import ChatCompose from "./ChatCompose";
import ChatDashedTemp from "./ChatDashedTemp";
import ChatDashedCheckedTemp from "./ChatDashedCheckedTemp";
import Check from "./Check";
import ChevronDown from "./ChevronDown";
import Clock from "./Clock";
import ComposeEditSquare from "./ComposeEditSquare";
import Copy from "./Copy";
import Cube from "./Cube";
import DotsHorizontal from "./DotsHorizontal";
import Download from "./Download";
import ExitLogout from "./ExitLogout";
import ExpandLg from "./ExpandLg";
import FileDocument from "./FileDocument";
import Filter from "./Filter";
import Folder from "./Folder";
import Images from "./Images";
import Globe from "./Globe";
import HandRaised from "./HandRaised";
import Home from "./Home";
import ImageSquare from "./ImageSquare";
import Lightbulb from "./Lightbulb";
import Maps from "./Maps";
import Mic from "./Mic";
import NotificationBell from "./NotificationBell";
import Paperclip from "./Paperclip";
import Pin from "./Pin";
import PlusComposer from "./PlusComposer";
import PlusSquareAdd from "./PlusSquareAdd";
import PopOutWindow from "./PopOutWindow";
import Reload from "./Reload";
import SavedXs from "./SavedXs";
import Search from "./Search";
import SettingsCog from "./SettingsCog";
import Share from "./Share";
import SidebarLeft from "./SidebarLeft";
import SoundOnReadOutLoudSpeaker from "./SoundOnReadOutLoudSpeaker";
import Terminal from "./Terminal";
import ThumbMixed from "./ThumbMixed";
import UploadDocuments from "./UploadDocuments";
import Voice5BarsSoundwave from "./Voice5BarsSoundwave";
import X from "./X";

export const officialIcons: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  home: Home,
  spaces: Images,
  image: ImageSquare,
  clock: Clock,
  dots: DotsHorizontal,
  search: Search,
  bell: NotificationBell,
  edit: ComposeEditSquare,
  plus: PlusComposer,
  down: ChevronDown,
  arrow: ArrowUp,
  mic: Mic,
  wave: Voice5BarsSoundwave,
  copy: Copy,
  sound: SoundOnReadOutLoudSpeaker,
  expand: ExpandLg,
  panel: SidebarLeft,
  'side-chat': PlusSquareAdd,
  folder: Folder,
  map: Maps,
  cube: Cube,
  branch: Branch,
  download: Download,
  settings: SettingsCog,
  logout: ExitLogout,
  refresh: Reload,
  check: Check,
  close: X,
  page: FileDocument,
  filter: Filter,
  hand: HandRaised,
  pin: Pin,
  archive: Archive,
  bubble: ChatCompose,
  temporary: ChatDashedTemp,
  'temporary-checked': ChatDashedCheckedTemp,
  comment: Chat,
  upload: UploadDocuments,
  share: Share,
  window: PopOutWindow,
  globe: Globe,
  terminal: Terminal,
  bookmark: SavedXs,
  book: BookClosed,
  paperclip: Paperclip,
  bulb: Lightbulb,
  feedback: ThumbMixed,
};
