import {
  LayoutDashboard,
  Bot,
  BarChart3,
  Inbox,
  FileText,
  CreditCard,
  Users,
  Sliders,
  Moon,
  Brain,
  Target,
  Activity,
  ShieldCheck,
  PhoneCall,
  Receipt,
  CalendarDays,
  Users2,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const CLIENT_NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/employees", label: "The Crew", icon: Users2 },
  { href: "/app/brief", label: "Morning Brief", icon: Moon },
  // Above Leads on purpose: a call is a lead that is still on the line, and the
  // one on the line is the one worth looking at first.
  { href: "/app/calls", label: "The Phone", icon: PhoneCall },
  { href: "/app/leads", label: "Leads", icon: Target },
  { href: "/app/estimates", label: "Estimates", icon: Receipt },
  { href: "/app/bookings", label: "The Diary", icon: CalendarDays },
  { href: "/app/gate", label: "The Queue", icon: ShieldCheck },
  { href: "/app/agents", label: "Agent Workspace", icon: Bot },
  { href: "/app/recall", label: "Recall", icon: Brain },
  { href: "/app/memory", label: "System Memory", icon: Brain },
  { href: "/app/ads", label: "Ad Ops", icon: BarChart3 },
  { href: "/app/requests", label: "Requests", icon: Inbox },
  { href: "/app/reports", label: "Reports", icon: FileText },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/signals", label: "Signals", icon: Activity },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/requests", label: "Request Queue", icon: Inbox },
  { href: "/admin/metrics", label: "Ad Metrics", icon: BarChart3 },
  { href: "/admin/agents", label: "Agent Prompts", icon: Sliders },
  { href: "/admin/plans", label: "Plans & Pricing", icon: CreditCard },
];

export function isNavActive(pathname: string, href: string) {
  if (href === "/app" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href);
}
