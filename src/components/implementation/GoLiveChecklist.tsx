import { useState } from "react";
import { CheckSquare, AlertTriangle, CheckCircle, Clock, Rocket, Shield, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImplementationData } from "@/pages/website/ImplementationToolkitPage";

interface GoLiveChecklistProps {
  data: ImplementationData;
  onUpdate: (data: ImplementationData) => void;
}

const preGoLiveItems = [
  { id: "master-data", label: "All master data uploaded and verified", critical: true },
  { id: "user-accounts", label: "User accounts created and tested", critical: true },
  { id: "roles-permissions", label: "Roles and permissions configured", critical: true },
  { id: "integrations-tested", label: "Integrations tested in production", critical: true },
  { id: "training-completed", label: "Training completed for all users", critical: true },
  { id: "support-matrix", label: "Support escalation matrix shared", critical: false },
  { id: "rollback-plan", label: "Rollback plan documented", critical: true },
  { id: "go-nogo-meeting", label: "Go/No-Go meeting conducted", critical: true },
  { id: "backup-verified", label: "Data backup verified", critical: true },
  { id: "ssl-certificates", label: "SSL certificates valid", critical: false },
  { id: "load-testing", label: "Load testing completed", critical: false },
  { id: "mobile-testing", label: "Mobile app testing on all devices", critical: true },

  // Production Readiness — Offline
  { id: "prod-offline-reboot", label: "Offline · Queue survives reboot", critical: true },
  { id: "prod-offline-app-update", label: "Offline · Queue survives app update", critical: true },
  { id: "prod-offline-network-loss", label: "Offline · Queue survives network loss", critical: false },
  { id: "prod-offline-app-kill", label: "Offline · Queue survives app kill", critical: true },
  { id: "prod-offline-resume", label: "Offline · Sync resumes from where it stopped", critical: false },

  // Production Readiness — Orders
  { id: "prod-orders-no-empty", label: "Orders · No order without items", critical: true },
  { id: "prod-orders-no-duplicates", label: "Orders · No duplicate orders", critical: true },
  { id: "prod-orders-no-missing-retailer", label: "Orders · No missing retailer", critical: false },
  { id: "prod-orders-no-missing-products", label: "Orders · No missing products", critical: false },
  { id: "prod-orders-edit-resettles", label: "Orders · Order edit re-settles correctly", critical: false },

  // Production Readiness — Master data
  { id: "prod-master-no-orphan-variants", label: "Master data · No orphan variants", critical: false },
  { id: "prod-master-no-duplicate-retailers", label: "Master data · No duplicate active retailers", critical: false },
  { id: "prod-master-no-broken-beats", label: "Master data · No broken beats", critical: false },
  { id: "prod-master-uom-schemes-offline", label: "Master data · UOM/schemes available offline", critical: false },

  // Production Readiness — Security
  { id: "prod-security-rls-enabled", label: "Security · RLS enabled on all tables", critical: true },
  { id: "prod-security-policies-verified", label: "Security · Policies verified", critical: false },
  { id: "prod-security-no-unexpected-ddl", label: "Security · No unexpected DDL changes (check Sync Health → security events)", critical: false },

  // Production Readiness — Performance
  { id: "prod-perf-1000-queue-drain", label: "Performance · 1,000 queued orders drain in bounded time", critical: false },
  { id: "prod-perf-distributor-transfer", label: "Performance · Distributor transfer (50 retailers / 1,000 orders)", critical: false },
  { id: "prod-perf-large-retailer-master", label: "Performance · Large retailer master", critical: false },
  { id: "prod-perf-large-product-master", label: "Performance · Large product master", critical: false },
];


const goLiveDayItems = [
  { id: "env-health", label: "Production environment health check", critical: true },
  { id: "morning-sync", label: "Morning sync with support team", critical: true },
  { id: "monitor-checkins", label: "Monitor first batch of check-ins", critical: true },
  { id: "monitor-orders", label: "Monitor first batch of orders", critical: true },
  { id: "dashboard-live", label: "Real-time dashboard operational", critical: true },
  { id: "support-hotline", label: "Support hotline active", critical: true },
  { id: "hourly-updates", label: "Hourly status updates to stakeholders", critical: false },
  { id: "issue-tracker", label: "Issue tracker ready", critical: true },
  { id: "war-room", label: "War room / command center active", critical: false },
];

const postGoLiveItems = [
  { id: "day1-review", label: "Day 1 review meeting completed", critical: true },
  { id: "critical-bugs", label: "Critical bugs resolved within 4 hours", critical: true },
  { id: "adoption-monitoring", label: "User adoption monitoring active", critical: false },
  { id: "feedback-collection", label: "Feedback collection mechanism in place", critical: false },
  { id: "performance-baseline", label: "Performance baseline established", critical: false },
  { id: "weekly-reports", label: "Weekly progress reports scheduled", critical: false },
  { id: "hypercare-team", label: "Hypercare team assigned", critical: true },
  { id: "documentation-updated", label: "Documentation updated with learnings", critical: false },
  { id: "bau-handover", label: "BAU support handover planned", critical: true },
];

const supportTiers = [
  { tier: "L1", scope: "User queries, how-to, access issues", responseSLA: "4 hours", resolutionSLA: "24 hours" },
  { tier: "L2", scope: "Configuration changes, minor fixes", responseSLA: "8 hours", resolutionSLA: "48 hours" },
  { tier: "L3", scope: "Enhancements, new features", responseSLA: "48 hours", resolutionSLA: "As estimated" },
];

export function GoLiveChecklist({ data, onUpdate }: GoLiveChecklistProps) {
  const [escalationMatrix, setEscalationMatrix] = useState({
    l1Support: { name: "", email: "", phone: "" },
    l2Support: { name: "", email: "", phone: "" },
    customerSuccess: { name: "", email: "", phone: "" },
    accountManager: { name: "", email: "", phone: "" },
  });

  const [notes, setNotes] = useState("");

  const updateChecklist = (section: 'preGoLive' | 'goLiveDay' | 'postGoLive', id: string, checked: boolean) => {
    onUpdate({
      ...data,
      goLive: {
        ...data.goLive,
        [section]: { ...data.goLive[section], [id]: checked },
      },
    });
  };

  const getProgress = (section: 'preGoLive' | 'goLiveDay' | 'postGoLive', items: typeof preGoLiveItems) => {
    const checked = items.filter((item) => data.goLive[section]?.[item.id]).length;
    return (checked / items.length) * 100;
  };

  const getCriticalProgress = (section: 'preGoLive' | 'goLiveDay' | 'postGoLive', items: typeof preGoLiveItems) => {
    const criticalItems = items.filter((item) => item.critical);
    const checked = criticalItems.filter((item) => data.goLive[section]?.[item.id]).length;
    return criticalItems.length > 0 ? (checked / criticalItems.length) * 100 : 0;
  };

  const isGoLiveReady = () => {
    const preGoLiveCritical = preGoLiveItems.filter((item) => item.critical);
    return preGoLiveCritical.every((item) => data.goLive.preGoLive?.[item.id]);
  };

  const renderChecklistSection = (
    title: string,
    section: 'preGoLive' | 'goLiveDay' | 'postGoLive',
    items: typeof preGoLiveItems,
    icon: React.ReactNode,
    color: string
  ) => (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/60">
              {items.filter((item) => data.goLive[section]?.[item.id]).length}/{items.length}
            </span>
            <div className={`px-2 py-1 rounded-full text-xs ${getCriticalProgress(section, items) === 100 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
              Critical: {Math.round(getCriticalProgress(section, items))}%
            </div>
          </div>
        </div>
        <Progress value={getProgress(section, items)} className="h-2 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                data.goLive[section]?.[item.id]
                  ? "bg-green-500/10 border-green-500/30"
                  : item.critical
                  ? "bg-red-500/5 border-red-500/20 hover:border-red-500/40"
                  : "bg-white/5 border-white/10 hover:border-white/20"
              }`}
              onClick={() => updateChecklist(section, item.id, !data.goLive[section]?.[item.id])}
            >
              <Checkbox
                checked={data.goLive[section]?.[item.id] || false}
                className="border-white/40"
              />
              <span className={`flex-1 ${data.goLive[section]?.[item.id] ? "text-green-400" : "text-white"}`}>
                {item.label}
              </span>
              {item.critical && !data.goLive[section]?.[item.id] && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                  Critical
                </span>
              )}
              {data.goLive[section]?.[item.id] && (
                <CheckCircle className="w-4 h-4 text-green-400" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Go-Live Readiness Status */}
      <Card className={`border ${isGoLiveReady() ? "bg-green-500/10 border-green-500/30" : "bg-amber-500/10 border-amber-500/30"}`}>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {isGoLiveReady() ? (
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Rocket className="w-8 h-8 text-green-400" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-amber-400" />
                </div>
              )}
              <div>
                <p className={`text-2xl font-bold ${isGoLiveReady() ? "text-green-400" : "text-amber-400"}`}>
                  {isGoLiveReady() ? "Ready for Go-Live!" : "Not Ready Yet"}
                </p>
                <p className="text-white/60 text-sm">
                  {isGoLiveReady()
                    ? "All critical pre-go-live tasks are completed"
                    : `${preGoLiveItems.filter((i) => i.critical && !data.goLive.preGoLive?.[i.id]).length} critical items pending`}
                </p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-white/60 text-sm">Overall Progress</p>
              <p className="text-3xl font-bold text-white">
                {Math.round(
                  (getProgress('preGoLive', preGoLiveItems) +
                    getProgress('goLiveDay', goLiveDayItems) +
                    getProgress('postGoLive', postGoLiveItems)) / 3
                )}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pre-Go-Live Checklist */}
      {renderChecklistSection(
        "Pre-Go-Live (T-7 Days)",
        "preGoLive",
        preGoLiveItems,
        <Clock className="w-5 h-5 text-amber-400" />,
        "amber"
      )}

      {/* Go-Live Day Checklist */}
      {renderChecklistSection(
        "Go-Live Day (T-0)",
        "goLiveDay",
        goLiveDayItems,
        <Rocket className="w-5 h-5 text-green-400" />,
        "green"
      )}

      {/* Post-Go-Live Checklist */}
      {renderChecklistSection(
        "Post-Go-Live (T+1 to T+30)",
        "postGoLive",
        postGoLiveItems,
        <CheckSquare className="w-5 h-5 text-purple-400" />,
        "purple"
      )}

      {/* Support Model */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            Support Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-white/60 py-3 px-3">Tier</th>
                  <th className="text-left text-white/60 py-3 px-3">Scope</th>
                  <th className="text-center text-white/60 py-3 px-3">Response SLA</th>
                  <th className="text-center text-white/60 py-3 px-3">Resolution SLA</th>
                </tr>
              </thead>
              <tbody>
                {supportTiers.map((tier) => (
                  <tr key={tier.tier} className="border-b border-white/5">
                    <td className="py-3 px-3">
                      <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded font-medium">
                        {tier.tier}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-white/70">{tier.scope}</td>
                    <td className="py-3 px-3 text-center text-white">{tier.responseSLA}</td>
                    <td className="py-3 px-3 text-center text-white">{tier.resolutionSLA}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                <Phone className="w-4 h-4 text-amber-400" />
                Support Channels
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-white/5 rounded">
                  <span className="text-white/70">Email</span>
                  <span className="text-white">24x7 (Non-urgent)</span>
                </div>
                <div className="flex justify-between p-2 bg-white/5 rounded">
                  <span className="text-white/70">Phone</span>
                  <span className="text-white">9 AM - 7 PM IST</span>
                </div>
                <div className="flex justify-between p-2 bg-white/5 rounded">
                  <span className="text-white/70">In-app Chat</span>
                  <span className="text-white">24x7</span>
                </div>
                <div className="flex justify-between p-2 bg-white/5 rounded">
                  <span className="text-white/70">WhatsApp</span>
                  <span className="text-white">9 AM - 7 PM IST</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-white font-medium mb-3">Escalation Matrix</h4>
              <div className="space-y-3">
                {Object.entries(escalationMatrix).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-white/60 text-xs capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={value.name}
                        onChange={(e) =>
                          setEscalationMatrix({
                            ...escalationMatrix,
                            [key]: { ...value, name: e.target.value },
                          })
                        }
                        placeholder="Name"
                        className="bg-white/5 border-white/20 text-white h-8 text-sm"
                      />
                      <Input
                        value={value.phone}
                        onChange={(e) =>
                          setEscalationMatrix({
                            ...escalationMatrix,
                            [key]: { ...value, phone: e.target.value },
                          })
                        }
                        placeholder="Phone"
                        className="bg-white/5 border-white/20 text-white h-8 text-sm w-32"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Go-Live Notes & Observations</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Document any observations, issues, or notes during the go-live process..."
            className="bg-white/5 border-white/20 text-white min-h-[150px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}
