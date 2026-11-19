import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, AlertCircle, CheckCircle2, Loader2, FileSpreadsheet, FileText } from "lucide-react";
import CategorySelect from "@/components/shared/CategorySelect";
import AddressInput from "@/components/shared/AddressInput";
import UploadCDAExcelDialog from "@/components/transactions/UploadCDAExcelDialog";
import { sendCDASubmittedEmail } from "@/utils/cdaEmails";

// Formats a raw number string with commas for display
const formatMoney = (val, noDecimal = false) => {
  const num = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return val;
  return noDecimal
    ? Math.round(num).toLocaleString("en-US")
    : num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const MoneyInput = ({ value, onChange, placeholder, readOnly, noDecimal = false, className = "" }) => {
  const [localVal, setLocalVal] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  if (readOnly) {
    return (
      <Input
        className={`mt-1.5 bg-gray-50 ${className}`}
        value={value !== "" && value !== undefined ? formatMoney(value, noDecimal) : ""}
        readOnly
      />
    );
  }

  const displayValue = isFocused ? localVal : (value !== "" && value !== undefined ? formatMoney(value, noDecimal) : "");

  return (
    <Input
      className={`mt-1.5 ${className}`}
      value={displayValue}
      placeholder={placeholder}
      onFocus={() => {
        setLocalVal(value ? String(value).replace(/,/g, "") : "");
        setIsFocused(true);
      }}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        setLocalVal(raw);
        onChange(raw);
      }}
      onBlur={() => {
        setIsFocused(false);
      }}
    />
  );
};

export default function SubmitCDA() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [allAgents, setAllAgents] = useState([]);
  const [agentProfile, setAgentProfile] = useState(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [mailingAddress, setMailingAddress] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);
  const [tcAgents, setTcAgents] = useState([]); // agents this user is a TC for
  const [selectedAgentEmail, setSelectedAgentEmail] = useState("");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({});
  const [contractParsing, setContractParsing] = useState(false);
  const [contractParseError, setContractParseError] = useState(null);
  const [hasCounterProposal, setHasCounterProposal] = useState(false);
  const [showContractPrompt, setShowContractPrompt] = useState(false);
  const [pendingContractFile, setPendingContractFile] = useState(null);
  const [counterProposalFile, setCounterProposalFile] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [commissionMode, setCommissionMode] = useState("plan"); // "plan" | "custom"
  const [planFlatFeeAmount, setPlanFlatFeeAmount] = useState(null); // non-null when plan is flat-fee type
  const [form, setForm] = useState({
    property_address: "", city: "", state: "", zip: "",
    closing_date: "", contract_date: "",
    sale_price: "", mls_number: "",
    transaction_type: "", category: "", file_type_name: "",
    commission_type: "percentage",
    total_commission_percentage: "", total_commission_amount: "",
    agent_split_percentage: "", company_split_percentage: "",
    agent_gross_commission: "", company_gross_commission: "",
    admin_fee_amount: "0",
    agent_net_commission: "",
    buyer_name: "", seller_name: "",
    title_company_name: "", title_company_email: "", title_company_phone: "",
    purchase_agreement_url: "", counter_proposal_url: "",
    agent_name: "", agent_email: "",
  });
  const [referrals, setReferrals] = useState([{ name: "", amount: "", mailing_address: "" }]);

  useEffect(() => {
    base44.entities.BrokerageSettings.list().then(data => {
      if (data?.length > 0) setSettings(data[0]);
    }).catch(() => {});
    base44.auth.me().then(async me => {
      setUser(me);
      setForm(f => ({ ...f, agent_email: me.email, agent_name: me.full_name }));
      const viewAsAgent = localStorage.getItem('viewAsAgent') === 'true';
      const adminView = (me.role === 'admin' || me.role === 'staff') && !viewAsAgent;
      setIsAdminView(adminView);
      // Fetch agents where this user is listed as a TC
      const allAgents = await base44.entities.Agent.list('-created_date', 500);
      const myTcAgents = (allAgents || []).filter(a =>
        (a.transaction_coordinators || []).includes(me.email)
      );
      setTcAgents(myTcAgents);
      // Fetch own agent profile for mailing address + roster check
      const myProfile = (allAgents || []).find(a => a.user_email === me.email);
      setAgentProfile(myProfile || null);
      setMailingAddress(myProfile?.mailing_address || '');
      // Pre-populate agent_name from roster to avoid mismatch
      if (myProfile?.full_name) {
        setForm(f => ({ ...f, agent_name: myProfile.full_name }));
      }
      setAllAgents(allAgents || []);
    });
  }, []);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handlePlanSelect = (planName) => {
    setSelectedPlan(planName);
    if (!planName || planName === "__none__") {
      setPlanFlatFeeAmount(null);
      return;
    }
    const plan = (settings?.commission_plans || []).find(p => p.name === planName);
    if (!plan) return;
    const isFlat = plan.type === "flat_fee";
    if (isFlat) {
      // Flat fee plan: company takes a fixed amount, agent gets total comm - flat fee
      setPlanFlatFeeAmount(plan.flat_fee_amount || 0);
      calcCommissions({
        commission_type: "percentage",
        agent_split_percentage: "",
        company_split_percentage: "",
        total_commission_percentage: "",
        total_commission_amount: "",
        _planFlatFee: plan.flat_fee_amount || 0,
      });
    } else {
      setPlanFlatFeeAmount(null);
      calcCommissions({
        commission_type: "percentage",
        agent_split_percentage: String(plan.agent_split || ""),
        company_split_percentage: String(plan.office_split || ""),
        total_commission_percentage: "",
        total_commission_amount: "",
        _planFlatFee: null,
      });
    }
  };

  const handleAgentSelect = (agentEmail) => {
    setSelectedAgentEmail(agentEmail);
    if (!agentEmail) {
      // Reset to self
      setForm(f => ({ ...f, agent_email: user.email, agent_name: user.full_name }));
      const myProfile = allAgents.find(a => a.user_email === user.email);
      setAgentProfile(myProfile || null);
      setMailingAddress(myProfile?.mailing_address || "");
    } else {
      const agent = tcAgents.find(a => a.user_email === agentEmail);
      setAgentProfile(agent || null);
      setMailingAddress(agent?.mailing_address || "");
      setForm(f => ({ ...f, agent_email: agentEmail, agent_name: agent?.full_name || agentEmail }));
    }
  };

  const calcCommissions = (updates = {}, newReferrals = null, overridePlanFlatFee = undefined) => {
    const merged = { ...form, ...updates };
    const activePlanFlatFee = overridePlanFlatFee !== undefined ? overridePlanFlatFee : (updates._planFlatFee !== undefined ? updates._planFlatFee : planFlatFeeAmount);
    const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([k]) => k !== '_planFlatFee'));
    const salePrice = parseFloat(merged.sale_price) || 0;
    const isFlat = merged.commission_type === "flat_fee";
    const totalComm = isFlat
      ? parseFloat(merged.total_commission_amount) || 0
      : salePrice * ((parseFloat(merged.total_commission_percentage) || 0) / 100);
    const refs = newReferrals || referrals;
    const totalReferral = refs.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const adminFee = parseFloat(merged.admin_fee_amount) || 0;

    let agentGross, companyGross, agentSplit, companySplit;
    if (activePlanFlatFee !== null && activePlanFlatFee !== undefined) {
      // Flat-fee plan: company takes fixed amount, agent gets the rest
      companyGross = activePlanFlatFee;
      agentGross = Math.max(0, totalComm - companyGross);
      agentSplit = totalComm > 0 ? (agentGross / totalComm * 100) : 0;
      companySplit = totalComm > 0 ? (companyGross / totalComm * 100) : 0;
    } else {
      agentSplit = parseFloat(merged.agent_split_percentage) || 0;
      companySplit = 100 - agentSplit;
      agentGross = totalComm * (agentSplit / 100);
      companyGross = totalComm * (companySplit / 100);
    }

    const agentNet = agentGross - totalReferral - adminFee;
    setForm(f => ({
      ...f, ...cleanUpdates,
      total_commission_amount: isFlat ? (merged.total_commission_amount || "") : (totalComm > 0 ? totalComm.toFixed(2) : ""),
      company_split_percentage: companySplit.toFixed(1),
      agent_gross_commission: agentGross > 0 ? agentGross.toFixed(2) : "",
      company_gross_commission: companyGross > 0 ? companyGross.toFixed(2) : "",
      agent_net_commission: agentNet.toFixed(2),
    }));
  };

  const handleUpload = async (field, file) => {
    setUploading(u => ({ ...u, [field]: true }));
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, [field]: file_url }));
    setUploading(u => ({ ...u, [field]: false }));
  };

  // Block submission if agent not in roster (skip check for TC-selected agents since they're always in roster)
  const agentNotInRoster = !selectedAgentEmail && allAgents.length > 0 && !agentProfile;
  const agentNameMismatch = !selectedAgentEmail && agentProfile && form.agent_name && form.agent_name !== agentProfile.full_name;
  const canProceedStep1 = !agentNotInRoster && !agentNameMismatch && form.property_address && form.city && form.state && form.zip &&
    form.closing_date && form.sale_price && form.transaction_type && form.file_type_name;

  const agentHasMailingAddress = !!(mailingAddress?.trim() || agentProfile?.mailing_address?.trim());
  const referralsWithPayment = referrals.filter(r => r.name || parseFloat(r.amount) > 0);
  const allReferralsHaveAddress = referralsWithPayment.every(r => r.mailing_address?.trim());
  const canSubmit = form.title_company_name && form.title_company_email && agentHasMailingAddress && allReferralsHaveAddress;

  const handleSaveDraft = async () => {
    setSaving(true);
    const data = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === "" ? undefined : isNaN(v) || v === "" ? v : parseFloat(v) || v])
    );
    await base44.entities.Transaction.create({ ...data, status: "draft" });
    navigate("/MyTransactions");
  };

  const handleSubmit = async () => {
    setSaving(true);
    const stringFields = ["property_address", "city", "state", "zip", "agent_name", "agent_email", "buyer_name", "seller_name", "title_company_name", "title_company_email", "title_company_phone", "mls_number", "transaction_type", "file_type_name", "category", "commission_type", "purchase_agreement_url", "counter_proposal_url", "closing_date", "contract_date", "notes"];
    const data = Object.fromEntries(
      Object.entries(form).map(([k, v]) => {
        if (stringFields.includes(k)) return [k, v || ""];
        return [k, v === "" ? undefined : isNaN(v) || typeof v !== "string" ? v : parseFloat(v) || v];
      })
    );
    const totalReferral = referrals.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    // Store referrals in the existing referral fields
    const referralData = {};
    referrals.forEach((r, i) => {
      if (r.name || r.amount) {
        referralData[`referral_${i+1}_name`] = r.name || undefined;
        referralData[`referral_${i+1}_amount`] = parseFloat(r.amount) || 0;
        referralData[`referral_${i+1}_address`] = r.mailing_address || undefined;
      }
    });
    const created = await base44.entities.Transaction.create({
      ...data,
      ...referralData,
      total_referral_amount: totalReferral,
      admin_fee_amount: parseFloat(form.admin_fee_amount) || 0,
      client_concession: parseFloat(form.client_concession) || 0,
      status: "submitted"
    });
    // Send admin notification email (replaces backend onTransactionCreated automation)
    sendCDASubmittedEmail(created).catch(() => {});
    navigate("/MyTransactions");
  };

  const handleContractUpload = async (contractFile, counterFile) => {
    if (!contractFile) return;
    setContractParsing(true);
    setContractParseError(null);
    setShowContractPrompt(false);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: contractFile });
      let counterUrl = null;
      if (counterFile) {
        const res = await base44.integrations.Core.UploadFile({ file: counterFile });
        counterUrl = res.file_url;
      }
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a real estate expert. Extract key transaction data from this Contract to Buy and Sell Real Estate document. Return a JSON with these fields (leave empty string if not found):
- property_address: street address only
- city
- state: 2-letter state code
- zip
- closing_date: ISO date YYYY-MM-DD
- contract_date: ISO date YYYY-MM-DD (contract execution date)
- sale_price: number only, no commas or dollar signs
- buyer_name: full name(s) of buyer(s)
- seller_name: full name(s) of seller(s)
- transaction_type: "buyer_side", "seller_side", or "transaction_broker"
- title_company_name
- title_company_email
- title_company_phone
- mls_number
Only return valid JSON.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            property_address: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            zip: { type: "string" },
            closing_date: { type: "string" },
            contract_date: { type: "string" },
            sale_price: { type: "string" },
            buyer_name: { type: "string" },
            seller_name: { type: "string" },
            transaction_type: { type: "string" },
            title_company_name: { type: "string" },
            title_company_email: { type: "string" },
            title_company_phone: { type: "string" },
            mls_number: { type: "string" },
          }
        }
      });
      setForm(f => ({
        ...f,
        property_address: result.property_address || f.property_address,
        city: result.city || f.city,
        state: result.state || f.state,
        zip: result.zip || f.zip,
        closing_date: result.closing_date || f.closing_date,
        contract_date: result.contract_date || f.contract_date,
        sale_price: result.sale_price || f.sale_price,
        buyer_name: result.buyer_name || f.buyer_name,
        seller_name: result.seller_name || f.seller_name,
        transaction_type: result.transaction_type || f.transaction_type,
        title_company_name: result.title_company_name || f.title_company_name,
        title_company_email: result.title_company_email || f.title_company_email,
        title_company_phone: result.title_company_phone || f.title_company_phone,
        mls_number: result.mls_number || f.mls_number,
        ...(counterUrl ? { counter_proposal_url: counterUrl } : {}),
      }));
      if (counterUrl) setHasCounterProposal(true);
      setStep(1);
    } catch (err) {
      setContractParseError("Could not parse the contract. Please check the file and try again, or use Manual Entry.");
    } finally {
      setContractParsing(false);
      setPendingContractFile(null);
      setCounterProposalFile(null);
    }
  };

  const UploadField = ({ field, label, required }) => (
    <div>
      <Label className={required ? "after:content-['*'] after:text-red-500 after:ml-1" : ""}>{label}</Label>
      <div className="mt-1.5">
        {form[field] ? (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-700 flex-1 truncate">Document uploaded</span>
            <Button variant="ghost" size="sm" onClick={() => set(field, "")}>Replace</Button>
          </div>
        ) : (
          <label className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
            {uploading[field] ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              <Upload className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-sm text-gray-500">
              {uploading[field] ? "Uploading..." : "Click to upload PDF or image"}
            </span>
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => e.target.files?.[0] && handleUpload(field, e.target.files[0])} />
          </label>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submit CDA</h1>
          <p className="text-gray-500 text-sm mt-1">Commission Disbursement Authorization</p>
        </div>
        {step > 0 && (
          <Button variant="outline" className="gap-2" onClick={() => setShowImport(true)}>
            <FileSpreadsheet className="w-4 h-4" /> Import CDA
          </Button>
        )}
      </div>
      <UploadCDAExcelDialog open={showImport} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); navigate("/MyTransactions"); }} />


      {/* Landing Step */}
      {step === 0 && (
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            className="flex flex-col items-center gap-3 p-8 border-2 border-blue-400 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors cursor-pointer text-left"
            onClick={() => setShowImport(true)}
          >
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-blue-900 text-lg">Import from Excel / CSV</p>
              <p className="text-sm text-blue-700 mt-1">Upload a spreadsheet with your transaction data — fastest option.</p>
            </div>
          </button>
          <button
            className="flex flex-col items-center gap-3 p-8 border-2 border-gray-200 bg-white rounded-xl hover:bg-gray-50 transition-colors cursor-pointer text-left"
            onClick={() => setStep(1)}
          >
            <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-lg">Manual Entry</p>
              <p className="text-sm text-gray-500 mt-1">Fill out the CDA form step by step.</p>
            </div>
          </button>
          <label className="flex flex-col items-center gap-3 p-8 border-2 border-emerald-400 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer text-left relative">
            {contractParsing ? (
              <>
                <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-900 text-lg">Reading Contract...</p>
                  <p className="text-sm text-emerald-700 mt-1">AI is extracting your transaction details.</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-900 text-lg">From Contract to Buy & Sell</p>
                  <p className="text-sm text-emerald-700 mt-1">Upload your contract PDF — AI will auto-fill the CDA fields for you.</p>
                </div>
              </>
            )}
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={contractParsing}
              onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingContractFile(f); setCounterProposalFile(null); setShowContractPrompt(true); } }}
            />
          </label>
          </div>
          {contractParseError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{contractParseError}</p>
            </div>
          )}
          {settings?.cda_template_url ? (
            <a
              href={settings.cda_template_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              Download Office CDA Template
            </a>
          ) : (
            <button
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              onClick={() => {
                const csv = [
                  ["agent_email","property_address","city","state","zip","closing_date","contract_date","sale_price","transaction_type","total_commission_percentage","agent_split_percentage","company_split_percentage","referral_fee_amount","title_company_name","title_company_email"],
                  ["jane@example.com","123 Main St","Denver","CO","80202","2026-04-15","2026-03-01","450000","buyer_side","3","70","30","0","Colorado Title","titles@coloradotitle.com"]
                ].map(r => r.join(",")).join("\n");
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                a.download = "cda_import_template.csv";
                a.click();
              }}
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              Download CDA Template
            </button>
          )}
        </div>
      )}

      {/* Steps */}
      <div className={`flex items-center gap-2 mb-6 ${step === 0 ? "hidden" : ""}`}>
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              step >= s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400"
            }`}>{s}</div>
            {s < 3 && <div className={`flex-1 h-0.5 w-12 ${step > s ? "bg-gray-900" : "bg-gray-200"}`} />}
          </div>
        ))}
        <div className="ml-2 text-sm text-gray-500">
          {step === 1 ? "Property Details" : step === 2 ? "Commission Info" : "Documents & Title"}
        </div>
      </div>

      {step > 0 && <Card>
        <CardContent className="p-6 space-y-4">

          {/* Step 1: Property */}
          {step === 1 && (
            <>
              <CardHeader className="p-0 pb-2"><CardTitle className="text-base">Property Information</CardTitle></CardHeader>

              {/* TC: Agent selector — only shown when user is a TC for other agents */}
              {tcAgents.length > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                  <p className="text-sm font-semibold text-blue-900">Submitting CDA for:</p>
                  <Select value={selectedAgentEmail || "__self__"} onValueChange={v => handleAgentSelect(v === "__self__" ? "" : v)}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__self__">Myself ({user?.full_name || user?.email})</SelectItem>
                      {tcAgents.map(a => (
                        <SelectItem key={a.user_email} value={a.user_email}>{a.full_name || a.user_email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Roster check — block if agent not in brokerage roster */}
              {!selectedAgentEmail && !agentProfile && allAgents.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-300 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900 text-sm">Agent Not Found in Brokerage Roster</p>
                    <p className="text-xs text-red-700 mt-0.5">Your account (<strong>{user?.email}</strong>) is not listed in the brokerage agent roster. Please contact your admin to be added before submitting a CDA.</p>
                  </div>
                </div>
              )}

              {/* Name mismatch warning */}
              {agentProfile && form.agent_name && form.agent_name !== agentProfile.full_name && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-900 text-sm">Name Mismatch with Brokerage Roster</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        CDA name is <strong>"{form.agent_name}"</strong> but roster shows <strong>"{agentProfile.full_name}"</strong>. Please update the CDA to match.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => set("agent_name", agentProfile.full_name)}>
                    Use Roster Name
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                <AddressInput
                  label="Property Address *"
                  required
                  value={[form.property_address, form.city, form.state ? form.state + (form.zip ? ' ' + form.zip : '') : form.zip].filter(Boolean).join(', ')}
                  onChange={v => {
                    // Parse back into individual fields for canProceedStep1
                    const zipM = v.match(/(\d{5}(?:-\d{4})?)\s*$/);
                    const zip = zipM ? zipM[1] : '';
                    const noZip = zip ? v.slice(0, v.lastIndexOf(zip)).trim().replace(/,?\s*$/, '') : v.trim();
                    const stateM = noZip.match(/,?\s*([A-Z]{2})\s*$/);
                    const state = stateM ? stateM[1] : '';
                    const noState = state ? noZip.slice(0, noZip.lastIndexOf(stateM[0])).trim() : noZip;
                    const lastComma = noState.lastIndexOf(',');
                    const street = lastComma !== -1 ? noState.slice(0, lastComma).trim() : noState;
                    const city = lastComma !== -1 ? noState.slice(lastComma + 1).trim() : '';
                    setForm(f => ({ ...f, property_address: street, city, state, zip }));
                  }}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Contract Date</Label>
                    <Input type="date" className="mt-1.5" value={form.contract_date} onChange={e => set("contract_date", e.target.value)} />
                  </div>
                  <div>
                    <Label>Closing Date *</Label>
                    <Input type="date" className="mt-1.5" value={form.closing_date} onChange={e => set("closing_date", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sale Price *</Label>
                    <MoneyInput value={form.sale_price} onChange={v => { set("sale_price", v); calcCommissions({ sale_price: v }); }} placeholder="500,000" noDecimal />
                  </div>
                  <div>
                    <Label>MLS #</Label>
                    <Input className="mt-1.5" value={form.mls_number} onChange={e => set("mls_number", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Transaction Type *</Label>
                  <Select value={form.transaction_type} onValueChange={v => set("transaction_type", v)}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer_side">Buyer Side</SelectItem>
                      <SelectItem value="seller_side">Seller Side</SelectItem>
                      <SelectItem value="transaction_broker">Transaction Broker (Double-Ended)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>File Type *</Label>
                  <Select value={form.file_type_name} onValueChange={v => set("file_type_name", v)}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select file type" /></SelectTrigger>
                    <SelectContent>
                      {(settings?.document_file_types?.length > 0
                        ? settings.document_file_types
                        : [
                            { name: "Listing Closing Checklist" },
                            { name: "Buyers Closing Checklist" },
                            { name: "Terminated Listing Check List" },
                            { name: "Terminated Buyer Checklist" },
                          ]
                      ).map(ft => (
                        <SelectItem key={ft.name} value={ft.name}>{ft.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Buyer Name(s)</Label>
                    <Input className="mt-1.5" value={form.buyer_name} onChange={e => set("buyer_name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Seller Name(s)</Label>
                    <Input className="mt-1.5" value={form.seller_name} onChange={e => set("seller_name", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Category</Label>
                  <CategorySelect className="mt-1.5" value={form.category} onChange={v => set("category", v)} placeholder="Select category (optional)" />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button disabled={!canProceedStep1} onClick={() => setStep(2)}>Next: Commission Info →</Button>
              </div>
            </>
          )}

          {/* Step 2: Commission */}
          {step === 2 && (
            <>
              <CardHeader className="p-0 pb-2"><CardTitle className="text-base">Commission Details</CardTitle></CardHeader>
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Enter your commission as you believe it should be. Admin will review and verify.
              </div>

              {/* Mode Toggle */}
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    commissionMode === "plan" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setCommissionMode("plan")}
                >
                  Use Commission Plan
                </button>
                <button
                  className={`flex-1 py-2 text-sm font-medium transition-colors border-l ${
                    commissionMode === "custom" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setCommissionMode("custom")}
                >
                  Custom Entry
                </button>
              </div>

              {/* Commission Plan Mode */}
              {commissionMode === "plan" && (
                <div className="space-y-4">
                  <div>
                    <Label>Select Commission Plan *</Label>
                    <Select value={selectedPlan || "__none__"} onValueChange={v => handlePlanSelect(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a plan..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Select a plan —</SelectItem>
                        {(settings?.commission_plans || []).map(plan => (
                          <SelectItem key={plan.name} value={plan.name}>
                            {plan.name} {plan.type === "flat_fee" ? `— Company takes $${(plan.flat_fee_amount || 0).toLocaleString()} flat` : `— ${plan.agent_split}% / ${plan.office_split}%`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(settings?.commission_plans || []).length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">No commission plans set up yet. Use Custom Entry or ask your admin to add plans in Brokerage Settings.</p>
                    )}
                  </div>

                  <div className="space-y-3">
                    {planFlatFeeAmount !== null && planFlatFeeAmount !== undefined && selectedPlan && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                        Company takes a flat <strong>${planFlatFeeAmount.toLocaleString()}</strong> — you receive all remaining commission minus referrals.
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Commission % on Sale</Label>
                        <Input type="number" className="mt-1.5" value={form.total_commission_percentage}
                          onChange={e => calcCommissions({ total_commission_percentage: e.target.value })} placeholder="3" />
                      </div>
                      <div><Label>Total Commission ($)</Label><MoneyInput value={form.total_commission_amount} readOnly /></div>
                      {selectedPlan && planFlatFeeAmount !== null && planFlatFeeAmount !== undefined ? (
                        <>
                          <div><Label>Company Flat Fee ($)</Label><MoneyInput value={planFlatFeeAmount} readOnly /></div>
                          <div><Label>Your Gross Commission ($)</Label><MoneyInput value={form.agent_gross_commission} readOnly /></div>
                        </>
                      ) : (
                        <>
                          <div>
                            <Label>Your Split %</Label>
                            <Input type="number" className="mt-1.5" value={form.agent_split_percentage}
                              onChange={e => calcCommissions({ agent_split_percentage: e.target.value })} placeholder="70" />
                          </div>
                          <div><Label>Company Split %</Label><Input className="mt-1.5 bg-gray-50" value={form.company_split_percentage} readOnly /></div>
                          <div><Label>Your Gross Commission ($)</Label><MoneyInput value={form.agent_gross_commission} readOnly /></div>
                        </>
                      )}
                      <div>
                        <Label>Admin Fee ($)</Label>
                        <MoneyInput value={form.admin_fee_amount} onChange={v => calcCommissions({ admin_fee_amount: v })} placeholder="0" />
                      </div>
                      <div>
                        <Label>Client Concession ($)</Label>
                        <MoneyInput value={form.client_concession || ""} onChange={v => set("client_concession", v)} placeholder="0" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom Entry Mode */}
              {commissionMode === "custom" && (
                <div className="space-y-4">
                  <div>
                    <Label>Commission Type</Label>
                    <Select value={form.commission_type} onValueChange={v => calcCommissions({ commission_type: v, total_commission_percentage: "", total_commission_amount: "" })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage of Sale Price</SelectItem>
                        <SelectItem value="flat_fee">Flat Fee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {form.commission_type === "percentage" ? (
                      <>
                        <div>
                          <Label>Commission % on Sale</Label>
                          <Input type="number" className="mt-1.5" value={form.total_commission_percentage}
                            onChange={e => calcCommissions({ total_commission_percentage: e.target.value })} placeholder="3" />
                        </div>
                        <div>
                          <Label>Total Commission ($)</Label>
                          <MoneyInput value={form.total_commission_amount} readOnly />
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2">
                        <Label>Flat Fee Commission Amount ($)</Label>
                        <MoneyInput value={form.total_commission_amount}
                          onChange={v => calcCommissions({ total_commission_amount: v })} placeholder="5,000" />
                      </div>
                    )}
                    <div>
                      <Label>Your Split %</Label>
                      <Input type="number" className="mt-1.5" value={form.agent_split_percentage}
                        onChange={e => calcCommissions({ agent_split_percentage: e.target.value })} placeholder="70" />
                    </div>
                    <div>
                      <Label>Company Split %</Label>
                      <Input type="number" className="mt-1.5 bg-gray-50" value={form.company_split_percentage} readOnly />
                    </div>
                    <div>
                      <Label>Your Gross Commission ($)</Label>
                      <MoneyInput value={form.agent_gross_commission} readOnly />
                    </div>
                    <div>
                      <Label>Admin Fee ($)</Label>
                      <MoneyInput value={form.admin_fee_amount}
                        onChange={v => calcCommissions({ admin_fee_amount: v })} placeholder="0" />
                    </div>
                    <div>
                      <Label>Client Concession ($)</Label>
                      <MoneyInput value={form.client_concession || ""} onChange={v => set("client_concession", v)} placeholder="0" />
                    </div>
                  </div>
                </div>
              )}

              {/* Multiple Referral Fees */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Referral Fees</Label>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => { const updated = [...referrals, { name: "", amount: "", mailing_address: "" }]; setReferrals(updated); calcCommissions({}, updated); }}>
                    + Add Referral
                  </Button>
                </div>
                <div className="space-y-2">
                  {referrals.map((r, i) => {
                    // Find matching internal agent by name or company
                    const nameLower = r.name?.trim().toLowerCase();
                    const matchedAgent = nameLower ? allAgents.find(a =>
                      a.full_name?.toLowerCase() === nameLower ||
                      a.company?.toLowerCase() === nameLower ||
                      (a.companies || []).some(c => c?.toLowerCase() === nameLower)
                    ) : null;
                    const profileAddress = matchedAgent?.mailing_address;

                    return (
                      <div key={i} className="space-y-1.5 p-3 border rounded-lg bg-gray-50">
                        <div className="flex gap-2 items-center">
                          <Input
                            className="flex-1"
                            placeholder="Payable to (name or LLC)"
                            value={r.name}
                            onChange={e => { const updated = referrals.map((x, j) => j === i ? { ...x, name: e.target.value } : x); setReferrals(updated); }}
                          />
                          <MoneyInput
                            className="w-32"
                            placeholder="Amount $"
                            value={r.amount}
                            onChange={v => { const updated = referrals.map((x, j) => j === i ? { ...x, amount: v } : x); setReferrals(updated); calcCommissions({}, updated); }}
                          />
                          {referrals.length > 1 && (
                            <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-red-400 hover:text-red-600 flex-shrink-0"
                              onClick={() => { const updated = referrals.filter((_, j) => j !== i); setReferrals(updated); calcCommissions({}, updated); }}>
                              ✕
                            </Button>
                          )}
                        </div>
                        {/* Address row */}
                        <div className="space-y-1">
                          {matchedAgent && profileAddress && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Internal agent found
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs border-green-400 text-green-700 hover:bg-green-50"
                                onClick={() => { const updated = referrals.map((x, j) => j === i ? { ...x, mailing_address: profileAddress } : x); setReferrals(updated); }}
                              >
                                Use Profile Address
                              </Button>
                            </div>
                          )}
                          {matchedAgent && !profileAddress && (
                            <p className="text-xs text-amber-600">Internal agent found but no mailing address on profile — please enter manually.</p>
                          )}
                          <AddressInput
                            value={r.mailing_address}
                            onChange={v => { const updated = referrals.map((x, j) => j === i ? { ...x, mailing_address: v } : x); setReferrals(updated); }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {form.agent_net_commission && (
                <div className="mt-2 p-4 bg-gray-900 rounded-xl text-white flex justify-between items-center">
                  <span className="text-sm text-gray-400">Your Net Commission</span>
                  <span className="text-2xl font-bold">${parseFloat(form.agent_net_commission).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {referralsWithPayment.length > 0 && !allReferralsHaveAddress && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">All referrals with a name or amount must have a mailing address.</p>
                </div>
              )}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                <Button disabled={!allReferralsHaveAddress} onClick={() => setStep(3)}>Next: Documents →</Button>
              </div>
            </>
          )}

          {/* Step 3: Documents */}
          {step === 3 && (
            <>
              <CardHeader className="p-0 pb-2"><CardTitle className="text-base">Documents & Title Company</CardTitle></CardHeader>

              {/* Mailing Address — always shown, with profile populate option */}
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-900 text-sm">Agent Mailing Address (for commission check) *</p>
                      <p className="text-xs text-amber-700 mt-0.5">Where should the commission check be mailed?</p>
                    </div>
                  </div>
                  {agentProfile?.mailing_address && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 text-xs h-7 border-amber-400 text-amber-700 hover:bg-amber-100"
                      onClick={() => setMailingAddress(agentProfile.mailing_address)}
                    >
                      Use Profile Address
                    </Button>
                  )}
                </div>
                {agentProfile?.mailing_address && mailingAddress === agentProfile.mailing_address && (
                  <div className="flex items-center gap-2 p-2 bg-white border border-amber-200 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-xs text-gray-700">{mailingAddress}</span>
                  </div>
                )}
                {(!agentProfile?.mailing_address || mailingAddress !== agentProfile.mailing_address) && (
                  <div className="flex flex-col gap-2">
                    <AddressInput
                      value={mailingAddress}
                      onChange={v => setMailingAddress(v)}
                    />
                    <Button
                      size="sm"
                      className="self-end"
                      disabled={!mailingAddress.trim() || savingAddress}
                      onClick={async () => {
                        setSavingAddress(true);
                        if (agentProfile) {
                          await base44.entities.Agent.update(agentProfile.id, { mailing_address: mailingAddress.trim() });
                          setAgentProfile(p => ({ ...p, mailing_address: mailingAddress.trim() }));
                        }
                        setSavingAddress(false);
                      }}
                    >
                      {savingAddress ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save to Profile"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <Checkbox id="counter" checked={hasCounterProposal} onCheckedChange={setHasCounterProposal} />
                <label htmlFor="counter" className="text-sm text-gray-600 cursor-pointer">
                  Contract was not fully executed — I have a counter proposal with final terms
                </label>
              </div>
              {hasCounterProposal && (
                <UploadField field="counter_proposal_url" label="Counter Proposal (Final Terms)" required />
              )}

              <div className="border-t pt-4 mt-2">
                <p className="text-sm font-semibold text-gray-700 mb-3">Title Company Information</p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label>Title Company Name *</Label>
                    <Input className="mt-1.5" value={form.title_company_name} onChange={e => set("title_company_name", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Title Company Email *</Label>
                      <Input type="email" className="mt-1.5" value={form.title_company_email} onChange={e => set("title_company_email", e.target.value)} />
                    </div>
                    <div>
                      <Label>Title Company Phone</Label>
                      <Input className="mt-1.5" value={form.title_company_phone} onChange={e => set("title_company_phone", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2 gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Draft"}
                  </Button>
                  <Button disabled={!canSubmit || saving} title={!agentHasMailingAddress ? "Agent mailing address is required" : ""} onClick={handleSubmit}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit CDA"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>}

      {/* Counter Proposal Prompt Dialog */}
      <Dialog open={showContractPrompt} onOpenChange={open => { if (!open) { setShowContractPrompt(false); setPendingContractFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Counter Proposal?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-gray-700">
              Does this contract have a <strong>Counter Proposal</strong> with final terms that supersede the original contract?
            </p>
            {counterProposalFile ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm text-green-700 flex-1 truncate">{counterProposalFile.name}</span>
                <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setCounterProposalFile(null)}>Remove</button>
              </div>
            ) : (
              <label className="flex items-center gap-3 p-3 border-2 border-dashed border-emerald-300 bg-emerald-50 rounded-lg cursor-pointer hover:border-emerald-400 transition-colors">
                <Upload className="w-4 h-4 text-emerald-500" />
                <span className="text-sm text-emerald-700">Upload Counter Proposal PDF (optional)</span>
                <input type="file" accept=".pdf,application/pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setCounterProposalFile(f); }} />
              </label>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleContractUpload(pendingContractFile, null)}>
              No Counter Proposal
            </Button>
            <Button onClick={() => handleContractUpload(pendingContractFile, counterProposalFile)}>
              {counterProposalFile ? "Continue with Counter Proposal" : "Continue Without"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}