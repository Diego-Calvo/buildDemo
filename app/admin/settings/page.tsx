import { Role } from "@prisma/client";
import { updateAdminControls, updateSettings } from "@/app/actions";
import { Card, PageHeader, Table, td, th } from "@/components/ui";
import { assertRole, getCurrentUser } from "@/lib/authz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const settingKeys = [
  "retentionMonths",
  "consentText",
  "manualHourlyCostUsd",
  "hostingMonthlyUsd",
];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  assertRole(user, [Role.ADMIN]);

  const [rows, policies, users] = await Promise.all([
    db.setting.findMany({
      where: { key: { in: settingKeys } },
      orderBy: { key: "asc" },
    }),
    db.slaPolicy.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
  ]);
  const settings = new Map(rows.map((setting) => [setting.key, setting.value]));
  const lastUpdated = rows.reduce<Date | null>(
    (latest, setting) =>
      !latest || setting.updatedAt > latest ? setting.updatedAt : latest,
    null,
  );

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="System settings"
        description="Manage candidate retention, consent language, and operating-cost assumptions."
      />
      <Card
        title="Recruiting controls"
        description={
          lastUpdated
            ? `Last updated ${lastUpdated.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}`
            : "No settings have been saved."
        }
        className="max-w-4xl"
      >
        <form action={updateSettings} className="p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Candidate retention period
              <div className="mt-1 flex items-center gap-2">
                <input
                  name="retentionMonths"
                  type="number"
                  min={1}
                  max={120}
                  required
                  defaultValue={settings.get("retentionMonths") ?? ""}
                  className="w-full"
                />
                <span className="text-sm text-slate-500">months</span>
              </div>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Expired candidate PII is anonymized by the retention job.
              </span>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Manual recruiting cost
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-slate-500">$</span>
                <input
                  name="manualHourlyCostUsd"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={settings.get("manualHourlyCostUsd") ?? ""}
                  className="w-full"
                />
                <span className="whitespace-nowrap text-sm text-slate-500">USD / hour</span>
              </div>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Used in operational savings comparisons.
              </span>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Monthly hosting cost
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-slate-500">$</span>
                <input
                  name="hostingMonthlyUsd"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={settings.get("hostingMonthlyUsd") ?? ""}
                  className="w-full"
                />
                <span className="whitespace-nowrap text-sm text-slate-500">USD / month</span>
              </div>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Baseline infrastructure assumption for cost modeling.
              </span>
            </label>

            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Candidate consent text
              <textarea
                name="consentText"
                rows={4}
                required
                defaultValue={settings.get("consentText") ?? ""}
                className="mt-1 w-full resize-y"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Displayed when collecting candidate information for recruiting purposes.
              </span>
            </label>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-500">
              Changes are applied immediately and retained in the system settings table.
            </p>
            <button className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800">
              Save settings
            </button>
          </div>
        </form>
      </Card>
      <form action={updateAdminControls} className="mt-6 space-y-6">
        <Card
          title="SLA policies"
          description="Targets and warning thresholds are live operational controls. Values are stored in hours."
        >
          <Table>
            <thead>
              <tr>
                <th className={th}>Policy</th>
                <th className={th}>From / to</th>
                <th className={th}>Target hours</th>
                <th className={th}>Warn at</th>
                <th className={th}>Calendar</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td className={`${td} font-medium`}>{policy.name}</td>
                  <td className={td}><span className="text-xs">{policy.stageFrom} → {policy.stageTo}</span></td>
                  <td className={td}><input name={`targetHours-${policy.id}`} type="number" min="1" defaultValue={policy.targetHours} className="w-28" /></td>
                  <td className={td}><div className="flex items-center gap-2"><input name={`warnAtPct-${policy.id}`} type="number" min="1" max="100" defaultValue={policy.warnAtPct} className="w-24" /><span className="text-xs text-slate-500">%</span></div></td>
                  <td className={td}>{policy.businessDaysOnly ? "Business days" : "Calendar"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card
          title="Role assignments"
          description="Prototype accounts map directly to the server-side authorization roles."
        >
          <Table>
            <thead><tr><th className={th}>User</th><th className={th}>Title</th><th className={th}>Role</th></tr></thead>
            <tbody>
              {users.map((account) => (
                <tr key={account.id}>
                  <td className={td}><div className="font-medium">{account.name}</div><div className="text-xs text-slate-500">{account.email}</div></td>
                  <td className={td}>{account.title}</td>
                  <td className={td}><select name={`role-${account.id}`} defaultValue={account.role}>{Object.values(Role).map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="flex justify-end">
          <button className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800">
            Save SLA and role controls
          </button>
        </div>
      </form>
    </>
  );
}
