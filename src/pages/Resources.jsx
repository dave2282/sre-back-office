import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, ChevronDown, ChevronUp, CheckCircle2, FileText, DollarSign, Building2, FolderOpen, Upload, ClipboardList, ExternalLink, Trash2, Loader2, FileArchive } from "lucide-react";

const GUIDES = [
  {
    title: "How to Submit a CDA",
    description: "Step-by-step guide to submitting your Commission Disbursement Authorization.",
    category: "Training",
    icon: FileText,
    color: "bg-blue-50 text-blue-600",
    steps: [
      {
        title: "Navigate to Submit CDA",
        body: "From the left sidebar, click Submit CDA. This opens the commission disbursement form.",
        tip: "You can also click the 'Submit CDA' button from your Agent Dashboard.",
      },
      {
        title: "Fill in Your Agent Information",
        body: "Enter your name, the commission check payable-to name (your name or LLC), and select whether you're working with a Buyer, Seller, or Both.",
      },
      {
        title: "Enter Property Details",
        body: "Fill in the Property Address, Buyer/Seller names, Co-Op agent (if applicable), and Closing Date.",
      },
      {
        title: "Enter the Closer / Title Company Info",
        body: "Add the closer's name, phone number, and email so the office can coordinate with the title company.",
      },
      {
        title: "Enter Commission Numbers",
        body: "Input the Purchase Price. Then enter your commission percentage OR a flat fee dollar amount. The system will auto-calculate the total commission. Enter the office split percentage or flat amount.",
      },
      {
        title: "Add Referral Fees (if any)",
        body: "Scroll to the Referral section. Add up to 4 referral recipients and their dollar amounts. The system deducts these from your net commission.",
      },
      {
        title: "Upload the Purchase Agreement",
        body: "Click 'Upload Purchase Agreement' and select the file from your computer. PDF and Word documents are accepted.",
      },
      {
        title: "Review & Submit",
        body: "Review the commission summary at the bottom — it shows your gross commission, deductions, and net commission. Click Submit to send it to your admin for approval.",
        tip: "Once submitted, the status becomes 'Submitted'. Your admin will review and either approve, mark as paid, or request a correction.",
      },
    ],
  },
  {
    title: "Document Vault Guide",
    description: "How to upload, organize, and track your transaction documents.",
    category: "Training",
    icon: FolderOpen,
    color: "bg-purple-50 text-purple-600",
    steps: [
      {
        title: "Open the Document Vault",
        body: "Click Document Vault in the left sidebar. You'll see two tabs: Transaction Records and Agent Records (admin only).",
      },
      {
        title: "Find Your Transaction",
        body: "Your transactions are listed as folders. Click on a transaction row to expand it and see its associated documents and checklist.",
      },
      {
        title: "Upload a Document Manually",
        body: "Click the 'Manual Upload' button in the top right. Choose between uploading to a New Property Entry (creates a CDA first), an Existing Transaction, or a Terminated Transaction.",
        tip: "For existing transactions, the file type is locked to whatever was set when the transaction was created.",
      },
      {
        title: "Use Smart Scan (AI Upload)",
        body: "Click Smart Scan to upload a multi-page PDF. The AI will automatically detect, name, and categorize each document — then match them to your transaction checklist.",
      },
      {
        title: "Check Document Status",
        body: "Each document shows a status badge: Pending, Approved, Rejected, or Needs Revision. Your admin reviews and updates these. The overall file shows Under Review, Missing Docs, or Completed.",
      },
      {
        title: "View or Download Documents",
        body: "Click the eye icon next to any document to open it in a new tab. Click the pencil icon to rename or add notes.",
      },
    ],
  },
  {
    title: "Commission Structure Overview",
    description: "Understand your split, cap, and how commissions are calculated.",
    category: "Finance",
    icon: DollarSign,
    color: "bg-green-50 text-green-600",
    steps: [
      {
        title: "Your Commission Plan",
        body: "Your commission plan is assigned by your admin in the Agent Roster. Common plan types include percentage splits (e.g. 70/30) and flat fee plans. You can view your plan by checking your agent profile.",
      },
      {
        title: "How Commission is Calculated",
        body: "Total Commission = Sale Price × Commission %. Your portion (Agent Gross Commission) = Total Commission × Your Split %. The office keeps the remainder (Company Gross Commission).",
        tip: "Example: $500,000 sale at 3% commission = $15,000 total. At a 70/30 split, you earn $10,500 gross.",
      },
      {
        title: "Referral Fee Deductions",
        body: "If you're paying a referral, those amounts are deducted from your gross commission before you receive your net commission. Always enter referrals in the CDA form.",
      },
      {
        title: "Admin Fees",
        body: "Some offices charge a per-transaction admin fee (e.g. Transaction Fee or E&O Fee). This is set by your brokerage admin and is deducted from your net commission.",
      },
      {
        title: "Annual Cap",
        body: "If your brokerage uses an annual cap model, once your total office commission payments hit the cap amount, you move to post-cap status and keep a higher percentage of commissions for the rest of the year.",
      },
      {
        title: "Checking Your Commissions",
        body: "Go to My Transactions to view each CDA's status and commission breakdown. Approved and Paid entries will show your net commission amount.",
      },
    ],
  },
  {
    title: "Transaction Document Checklist",
    description: "Everything you need to include with every transaction submission.",
    category: "Compliance",
    icon: ClipboardList,
    color: "bg-orange-50 text-orange-600",
    steps: [
      {
        title: "Listing Closing Checklist",
        body: "Required for seller-side closings. Typically includes: Purchase Agreement, Counter Proposal (if any), Addendums, Commission Agreement, Seller's ID Verification.",
      },
      {
        title: "Buyers Closing Checklist",
        body: "Required for buyer-side closings. Typically includes: Purchase Agreement, Counter Proposal (if any), Addendums, Buyer's ID Verification, Agency Disclosure.",
      },
      {
        title: "Terminated Listing Checklist",
        body: "Required when a listing is cancelled. Submit the original listing agreement, cancellation/release form, and any relevant addendums.",
      },
      {
        title: "Terminated Buyer Checklist",
        body: "Required when a buyer representation agreement is cancelled. Submit the buyer's agreement, mutual release, and any addendums.",
      },
      {
        title: "How to Submit Required Docs",
        body: "Open the Document Vault, find the transaction, expand it, and you'll see the checklist. Click 'Add' next to each required document to upload it individually, or use Smart Scan to upload them all at once.",
        tip: "Documents marked as Pending are waiting for admin review. Rejected means you need to re-upload.",
      },
      {
        title: "File Status Definitions",
        body: "Under Review = Admin is reviewing your file. Missing Docs = Some required documents haven't been uploaded yet. Completed = All documents are approved and the file is closed.",
      },
    ],
  },
  {
    title: "Agent Dashboard Overview",
    description: "Understanding your dashboard stats, reports, and quick actions.",
    category: "Training",
    icon: BookOpen,
    color: "bg-teal-50 text-teal-600",
    steps: [
      {
        title: "Commission Stats Cards",
        body: "The top row shows your Gross Commission (filtered by the date range you select), number of Closed Deals, Pending CDAs, Total Revenue Generated (all time), and Outstanding Balance (commissions not yet paid).",
        tip: "Use the date range selector in the top right to switch between MTD, QTD, YTD, Last 12 Months, Last Year, or All Time.",
      },
      {
        title: "Document Vault Summary",
        body: "Below the commission stats, you'll see your Document Vault stats: Closed Files, Buyer Files, Seller Files, and Files Needing Attention (documents that are pending or rejected).",
      },
      {
        title: "My Document Files",
        body: "This section lists all your transaction folders. Green 'Complete' means all docs are approved. Orange 'Needs Attention' means you have pending or rejected documents to address.",
      },
      {
        title: "Recent Transactions",
        body: "The Recent Transactions card shows your 5 most recent CDAs with their status badges. You can quickly update the 'Working With' type (Buyer/Seller/Both) directly from this card.",
      },
      {
        title: "Community Board",
        body: "Post quick updates or read team announcements directly from your dashboard. Click 'View All' to go to the full Community Board page.",
      },
      {
        title: "Export Excel Report",
        body: "Click 'Export Excel' to download a spreadsheet with all your transactions and accounting entries for the current date range. Great for tax preparation or personal tracking.",
      },
    ],
  },
  {
    title: "My Transactions",
    description: "How to view, filter, and download your CDA records.",
    category: "Training",
    icon: Building2,
    color: "bg-indigo-50 text-indigo-600",
    steps: [
      {
        title: "Viewing Your Transactions",
        body: "Go to My Transactions in the sidebar. All your submitted CDAs are listed here, sorted by most recent.",
      },
      {
        title: "Filtering by Status",
        body: "Use the Status dropdown to filter by: Draft, Submitted, Correction Needed, Approved, or Paid.",
      },
      {
        title: "Expanding a Transaction",
        body: "Click on any transaction card to expand it and see the full commission breakdown — sale price, splits, referral fees, and net commission.",
      },
      {
        title: "Correction Needed",
        body: "If your admin flags a CDA as Correction Needed, you'll see an orange alert with their note explaining what needs to be fixed. Contact your admin to resubmit.",
      },
      {
        title: "Downloading Your CDA",
        body: "Expand a transaction and click 'Download CDA PDF' to save a formatted copy of your Commission Disbursement Authorization for your records.",
      },
    ],
  },
];

function StepCard({ step, index }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </div>
        {<div className="w-0.5 bg-gray-200 flex-1 mt-2 mb-0 min-h-[16px]" />}
      </div>
      <div className="pb-5 flex-1">
        <p className="font-semibold text-gray-900 text-sm">{step.title}</p>
        <p className="text-sm text-gray-600 mt-1">{step.body}</p>
        {step.tip && (
          <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-700"><span className="font-semibold">💡 Tip:</span> {step.tip}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function GuideCard({ guide }) {
  const [open, setOpen] = useState(false);
  const Icon = guide.icon;

  return (
    <Card className={`transition-shadow ${open ? "shadow-md" : "hover:shadow-md"}`}>
      <CardContent className="p-5">
        <button
          className="w-full text-left flex items-start gap-4"
          onClick={() => setOpen(o => !o)}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${guide.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-gray-900">{guide.title}</p>
              {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{guide.description}</p>
            <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{guide.category}</span>
          </div>
        </button>

        {open && (
          <div className="mt-5 border-t pt-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{guide.steps.length} Steps</p>
            <div>
              {guide.steps.map((step, i) => (
                <StepCard key={i} step={step} index={i} />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700 font-medium">You're all set! If you have questions, post on the Community Board.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const OFFICE_DOC_CATEGORIES = [
  { value: "policy_manual", label: "Policy Manual" },
  { value: "office_announcement", label: "Office Announcement" },
  { value: "contractor_agreement", label: "Contractor Agreement" },
  { value: "other", label: "Other" },
];

function OfficeDocumentsSection({ user }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [category, setCategory] = useState("other");
  const [notes, setNotes] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "staff";

  const load = async () => {
    const data = await base44.entities.Document.filter({ doc_section: "office", agent_email: "__office__" }, "-created_date", 100);
    setDocs(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
      await base44.entities.Document.create({
        name: f.name.replace(/\.[^.]+$/, ""),
        category,
        notes,
        file_url,
        file_type: f.type,
        doc_section: "office",
        agent_email: "__office__",
      });
      setUploadProgress(i + 1);
    }
    await load();
    setShowUpload(false);
    setFiles([]);
    setCategory("other");
    setNotes("");
    setUploadProgress(0);
    setUploading(false);
  };

  const handleDelete = async (doc) => {
    await base44.entities.Document.delete(doc.id);
    await load();
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Office Documents</p>
              <p className="text-sm text-gray-500">Brokerage-wide documents available to all agents</p>
            </div>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowUpload(true)} className="gap-1.5">
              <Upload className="w-4 h-4" /> Upload
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No office documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50 hover:bg-white transition-colors">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                  {doc.notes && <p className="text-xs text-gray-500 mt-0.5">{doc.notes}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{OFFICE_DOC_CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}</p>
                </div>
                <a href={doc.file_url} target="_blank" rel="noreferrer">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-700"><ExternalLink className="w-4 h-4" /></Button>
                </a>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => handleDelete(doc)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showUpload} onOpenChange={open => { if (!open && !uploading) { setShowUpload(false); setFiles([]); setCategory("other"); setNotes(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Office Documents</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OFFICE_DOC_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (applied to all)</Label>
              <Input className="mt-1.5" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Short description (optional)" />
            </div>
            <div>
              <Label>Files *</Label>
              <label className={`mt-1.5 flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                files.length > 0 ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-gray-400"
              }`}>
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-500">
                  {files.length > 0 ? `${files.length} file${files.length > 1 ? "s" : ""} selected` : "Click to select one or more files"}
                </span>
                <input type="file" className="hidden" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />
              </label>
              {files.length > 0 && (
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                      <FileText className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {uploading && (
              <p className="text-xs text-blue-600 text-center">Uploading {uploadProgress} of {files.length}...</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUpload(false); setFiles([]); setCategory("other"); setNotes(""); }} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || files.length === 0}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Upload ${files.length > 1 ? `${files.length} Files` : "File"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function Resources() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Resources & Training</h1>
        <p className="text-gray-500 text-sm mt-1">Click any guide below to expand step-by-step instructions</p>
      </div>

      <OfficeDocumentsSection user={user} />

      <div className="space-y-4">
        {GUIDES.map((guide, i) => (
          <GuideCard key={i} guide={guide} />
        ))}
      </div>

      <div className="mt-8 p-6 bg-gray-50 rounded-xl text-center">
        <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">Have a question not covered here? Post on the <strong>Community Board</strong> and your team can help.</p>
      </div>
    </div>
  );
}