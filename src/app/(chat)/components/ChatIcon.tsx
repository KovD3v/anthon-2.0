import {
  Activity,
  Brain,
  CalendarDays,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  type LucideIcon,
  type LucideProps,
  MessageSquare,
  RefreshCcw,
  Shield,
  Target,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import {
  type ChatIcon as ChatIconKey,
  normalizeChatIcon,
} from "@/lib/chat-icons";

const ICON_COMPONENTS: Record<ChatIconKey, LucideIcon> = {
  TARGET: Target,
  TROPHY: Trophy,
  DUMBBELL: Dumbbell,
  ACTIVITY: Activity,
  BRAIN: Brain,
  HEART_PULSE: HeartPulse,
  TIMER: Timer,
  CALENDAR_DAYS: CalendarDays,
  FLAME: Flame,
  SHIELD: Shield,
  USERS: Users,
  FOOTPRINTS: Footprints,
  REFRESH_CCW: RefreshCcw,
  MESSAGE_SQUARE: MessageSquare,
};

export function ChatIcon({
  icon,
  ...props
}: LucideProps & { icon: ChatIconKey }) {
  const safeIcon = normalizeChatIcon(icon);
  const IconComponent = ICON_COMPONENTS[safeIcon];

  return (
    <IconComponent {...props} aria-hidden="true" data-chat-icon={safeIcon} />
  );
}
