import type { User } from "@prisma/client";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ClipboardCheck,
  FileStack,
  Gauge,
  Home,
  Inbox,
  Search,
  Settings,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { switchUser } from "@/app/actions";
import { NAV_BY_ROLE, ROLE_LABELS } from "@/lib/authz";

const navigation = {
  "/": { label: "My work today", icon: Home },
  "/intake": { label: "Intake queue", icon: Inbox },
  "/requisitions": { label: "Requisitions", icon: BriefcaseBusiness },
  "/hiring-manager": { label: "HM cockpit", icon: Gauge },
  "/interviews": { label: "Interviews", icon: ClipboardCheck },
  "/payroll": { label: "Payroll approvals", icon: WalletCards },
  "/leader": { label: "Leader dashboard", icon: BarChart3 },
  "/templates": { label: "JD templates", icon: FileStack },
  "/ops": { label: "Operations", icon: ShieldCheck },
  "/admin/settings": { label: "Settings", icon: Settings },
} as const;

export function AppShell({
  user,
  users,
  notificationCount,
  children,
}: {
  user: User;
  users: User[];
  notificationCount: number;
  children: React.ReactNode;
}) {
  const links = NAV_BY_ROLE[user.role];
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white px-5">
        <Link href="/" className="flex w-64 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-sm font-bold text-white">
            TF
          </div>
          <div>
            <div className="font-semibold leading-5 text-slate-900">TalentFlow</div>
            <div className="text-xs text-slate-500">Recruiting operations</div>
          </div>
        </Link>
        <form action="/search" className="relative hidden max-w-xl flex-1 md:block">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            name="q"
            aria-label="Search candidates and requisitions"
            placeholder="Search candidate or requisition code"
            className="w-full bg-slate-50 pl-9"
          />
        </form>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/"
            title={`${notificationCount} unread notifications`}
            className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                {notificationCount}
              </span>
            )}
          </Link>
          <form action={switchUser} className="flex items-center gap-2">
            <select
              name="userId"
              defaultValue={user.id}
              aria-label="Switch current role"
              className="max-w-52 py-1.5"
            >
              {users.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {ROLE_LABELS[item.role]}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700">
              Switch
            </button>
          </form>
        </div>
      </header>
      <aside className="fixed bottom-0 left-0 top-16 z-20 hidden w-64 border-r border-slate-200 bg-slate-900 px-3 py-5 text-slate-200 lg:block">
        <div className="mb-5 px-3">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Working as
          </div>
          <div className="mt-1 text-sm font-semibold">{ROLE_LABELS[user.role]}</div>
          <div className="text-xs text-slate-400">{user.name}</div>
        </div>
        <nav className="space-y-1">
          {links.map((href) => {
            const item = navigation[href as keyof typeof navigation];
            const Icon = item.icon;
            return (
              <Link
                href={href}
                key={href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-800 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-5 left-3 right-3 rounded-lg border border-slate-700 bg-slate-800 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Audit logging active
          </div>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">
            Every workflow change is recorded in the immutable ledger.
          </p>
        </div>
      </aside>
      <main className="pt-16 lg:pl-64">
        <div className="mx-auto max-w-[1600px] p-5 md:p-8">{children}</div>
      </main>
    </div>
  );
}
