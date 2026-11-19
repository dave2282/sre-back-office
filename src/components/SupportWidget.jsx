import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Loader2, CheckCircle2, Upload } from "lucide-react";

export default function SupportWidget({ user, brokerageName }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "bug",
    priority: "medium",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    let screenshot_url = null;
    if (screenshotFile) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: screenshotFile });
      screenshot_url = file_url;
    }
    await base44.entities.SupportTicket.create({
      ...form,
      submitted_by_email: user?.email || "",
      submitted_by_name: user?.full_name || "",
      brokerage_name: brokerageName || "",
      status: "open",
      ...(screenshot_url ? { screenshot_url } : {}),
    });
    setSubmitting(false);
    setDone(true);
    setTimeout(() => {
      setDone(false);
      setOpen(false);
      setForm({ title: "", description: "", category: "bug", priority: "medium" });
      setScreenshotFile(null);
    }, 2500);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        style={{ backgroundColor: "#1e3a5f" }}
        title="Contact Support"
      >
        <MessageCircle className="w-5 h-5 text-white" />
      </button>

      <Dialog open={open} onOpenChange={open => { if (!submitting) setOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contact Support</DialogTitle>
          </DialogHeader>

          {done ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="font-semibold text-gray-900">Ticket Submitted!</p>
              <p className="text-sm text-gray-500 mt-1">We'll get back to you as soon as possible.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 py-2">
              <div>
                <Label>Issue Title *</Label>
                <Input className="mt-1" placeholder="Short summary of the problem" value={form.title} onChange={e => set("title", e.target.value)} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => set("category", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">Bug / Error</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="account">Account</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={v => set("priority", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Description *</Label>
                <textarea
                  className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  rows={4}
                  placeholder="Describe the issue in detail. What were you doing? What happened?"
                  value={form.description}
                  onChange={e => set("description", e.target.value)}
                  required
                />
              </div>

              <div>
                <Label>Screenshot (optional)</Label>
                <label className={`mt-1 flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors text-sm ${screenshotFile ? "border-green-400 bg-green-50 text-green-700" : "border-gray-200 hover:border-gray-400 text-gray-500"}`}>
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  {screenshotFile ? screenshotFile.name : "Attach a screenshot"}
                  <input type="file" className="hidden" accept="image/*,.png,.jpg,.jpeg,.webp" onChange={e => setScreenshotFile(e.target.files?.[0] || null)} />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting || !form.title || !form.description}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Ticket"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}