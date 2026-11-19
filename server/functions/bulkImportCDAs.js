// Ported from base44/functions/bulkImportCDAs/entry.ts
import * as XLSX from 'xlsx';

// Pre-build lookup map for efficient scanning (single pass through rows)
function buildRowMap(rows) {
  const map = { col2: {}, col1: {}, commissions: {} };
  for (const row of rows) {
    const c1 = String(row[1] || "").toLowerCase().trim();
    const c2 = String(row[2] || "").toLowerCase().trim();
    const c3 = String(row[3] || "").toLowerCase().trim();
    const c6 = String(row[6] || "").toLowerCase().trim();
    
    if (c2) map.col2[c2] = String(row[3] || "").trim();
    if (c1) map.col1[c1] = String(row[5] || "").trim();
    if (c3 && c6.includes("commission paid")) {
      map.commissions[c3] = parseFloat(row[7] || 0) || 0;
    }
  }
  return map;
}

function getVal(map, labelMatch) {
  const lowerLabel = labelMatch.toLowerCase();
  for (const key in map.col2) {
    if (key.includes(lowerLabel)) return map.col2[key];
  }
  return "";
}

function getTotalVal(map, labelMatch) {
  const lowerLabel = labelMatch.toLowerCase();
  for (const key in map.col1) {
    if (key.includes(lowerLabel)) return map.col1[key];
  }
  return "";
}

function getCommissionPaid(map, name) {
  return map.commissions[name.toLowerCase()] || 0;
}

// Parse Excel date serial or date string → returns YYYY-MM-DD
function parseDate(val) {
  if (!val) return "";
  const num = parseFloat(val);
  if (!isNaN(num) && num > 40000) {
    const msUtc = Math.round((num - 25569) * 86400 * 1000);
    const d = new Date(msUtc);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const parts = String(val).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (parts) return `${parts[3]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  return String(val);
}

export default async (req, base44) => {
  try {
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const isAdmin = user.role === 'admin' || user.role === 'staff';

    const { file_url } = await req.json();
    if (!file_url) return Response.json({ error: 'No file provided' }, { status: 400 });

    const fileRes = await fetch(file_url);
    const arrayBuffer = await fileRes.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

    const sheetName = workbook.SheetNames.includes('Input Form') ? 'Input Form' : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return Response.json({ error: "No sheets found" }, { status: 400 });

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const rowMap = buildRowMap(rows);

    // --- Agent ---
    const agentName = getVal(rowMap, "Your Name");
    if (!agentName) {
      return Response.json({ error: "Could not find agent name ('Your Name:') in file." }, { status: 400 });
    }

    // --- Working With / Transaction Type ---
    const workingWith = getVal(rowMap, "Working With");

    // --- Commission Check Payable To ---
    const commissionCheckPayableTo = getVal(rowMap, "Commission Check Payable") || getVal(rowMap, "LLC Name");

    // --- Property Info ---
    const propertyAddress = getVal(rowMap, "Proprety Address") || getVal(rowMap, "Property Address");
    const buyerName = getVal(rowMap, "Buyer(s)");
    const sellerName = getVal(rowMap, "Seller(s)");
    const coopAgent = getVal(rowMap, "Co-Op Agent");

    // --- Dates ---
    const closingDate = parseDate(getVal(rowMap, "Closing Date"));

    // --- Title Company ---
    const titleCompanyName = getVal(rowMap, "Closer's Name");
    const titleCompanyPhone = getVal(rowMap, "Phone");
    const titleCompanyEmail = getVal(rowMap, "Closer's Email");

    // --- Purchase Price ---
    const salePrice = parseFloat(getVal(rowMap, "Purchase Price")) || 0;

    // --- Commission ---
    const commissionFlatFee = parseFloat(getVal(rowMap, "Commission $ (if flat fee)")) || 0;
    const commissionPctRaw = parseFloat(getVal(rowMap, "Commission %:")) || 0;
    const commissionPercentage = commissionPctRaw > 1 ? commissionPctRaw / 100 : commissionPctRaw;
    const totalCommissionAmount = parseFloat(getTotalVal(rowMap, "Total Commission Paid")) || 
      (commissionFlatFee > 0 ? commissionFlatFee : salePrice * commissionPercentage);

    // --- Office Split ---
    const officeSplitPctRaw = parseFloat(getVal(rowMap, "Split %:")) || 0;
    const officeSplitFlat = parseFloat(getVal(rowMap, "Split $ (if flat fee):")) || 0;

    // --- Company commission ---
    let companyGross = 0;
    if (officeSplitFlat > 0) {
      companyGross = officeSplitFlat;
    } else if (officeSplitPctRaw > 0) {
      const pct = officeSplitPctRaw > 1 ? officeSplitPctRaw / 100 : officeSplitPctRaw;
      companyGross = totalCommissionAmount * pct;
    } else {
      companyGross = getCommissionPaid(rowMap, "Signature Real Estate");
    }

    const agentGross = totalCommissionAmount - companyGross;

    // --- Referrals ---
    const referral1Name = getVal(rowMap, "Referral 1:");
    const referral2Name = getVal(rowMap, "Referral 2:");
    const referral3Name = getVal(rowMap, "Referral 3:");
    const referral4Name = getVal(rowMap, "Referral 4:");

    // Get referral amounts from col7 of referral rows
    let ref1Amt = 0, ref2Amt = 0, ref3Amt = 0, ref4Amt = 0;
    for (const row of rows) {
      const c2 = String(row[2] || "").toLowerCase().trim();
      if (c2 === "referral 1:") ref1Amt = parseFloat(row[7] || 0) || 0;
      else if (c2 === "referral 2:") ref2Amt = parseFloat(row[7] || 0) || 0;
      else if (c2 === "referral 3:") ref3Amt = parseFloat(row[7] || 0) || 0;
      else if (c2 === "referral 4:") ref4Amt = parseFloat(row[7] || 0) || 0;
    }
    const totalReferral = ref1Amt + ref2Amt + ref3Amt + ref4Amt;

    // --- Admin Fee ---
    let adminFeePayableTo = "";
    let adminFeeAmount = 0;
    for (const row of rows) {
      const c2 = String(row[2] || "").toLowerCase().trim();
      if (c2.includes("admin fee") && c2.includes("payable")) {
        adminFeePayableTo = String(row[3] || "").trim();
        adminFeeAmount = parseFloat(row[7] || 0) || 0;
        break;
      }
    }

    // --- Client Concession ---
    const clientConcession = parseFloat(getVal(rowMap, "Client's Concession")) || 0;

    // --- Agent Net ---
    const agentNet = agentGross - totalReferral - clientConcession;

    // --- Lookup agent email + roster name validation ---
    let agentEmail = user.email;
    const allAgents = await base44.asServiceRole.entities.Agent.list();
    if (isAdmin) {
      const agent = allAgents.find(a =>
        a.full_name?.toLowerCase().trim() === agentName.toLowerCase().trim()
      );
      agentEmail = agent?.user_email || user.email;
    } else {
      // Non-admin: verify the agent name in the file matches their roster entry
      const myProfile = allAgents.find(a => a.user_email === user.email);
      if (myProfile && myProfile.full_name?.toLowerCase().trim() !== agentName.toLowerCase().trim()) {
        return Response.json({
          success: 0,
          failed: 1,
          failedAddresses: [`Name mismatch: CDA says "${agentName}" but roster shows "${myProfile.full_name}". Please correct the name in your CDA file and re-upload.`],
          skipped: 0,
          skippedAddresses: []
        });
      }
    }

    const txnData = {
      agent_email: agentEmail,
      agent_name: agentName,
      working_with: workingWith || "Buyer",
      commission_check_payable_to: commissionCheckPayableTo,
      property_address: propertyAddress || "See CDA file",
      buyer_name: buyerName,
      seller_name: sellerName,
      coop_agent: coopAgent,
      closing_date: closingDate,
      title_company_name: titleCompanyName,
      title_company_phone: titleCompanyPhone,
      title_company_email: titleCompanyEmail,
      sale_price: salePrice,
      commission_flat_fee: commissionFlatFee,
      commission_percentage: commissionPercentage * 100,
      total_commission_amount: Math.round(totalCommissionAmount * 100) / 100,
      office_split_percentage: officeSplitPctRaw,
      office_split_flat: officeSplitFlat,
      company_gross_commission: Math.round(companyGross * 100) / 100,
      agent_gross_commission: Math.round(agentGross * 100) / 100,
      referral_1_name: referral1Name,
      referral_1_amount: ref1Amt,
      referral_2_name: referral2Name,
      referral_2_amount: ref2Amt,
      referral_3_name: referral3Name,
      referral_3_amount: ref3Amt,
      referral_4_name: referral4Name,
      referral_4_amount: ref4Amt,
      total_referral_amount: totalReferral,
      admin_fee_payable_to: adminFeePayableTo,
      admin_fee_amount: adminFeeAmount,
      client_concession: clientConcession,
      agent_net_commission: Math.round(agentNet * 100) / 100,
      status: "submitted",
      notes: "",
      additional_docs: [{ name: `CDA - ${agentName} - ${propertyAddress || 'Unknown Address'} - ${closingDate || new Date().toISOString().split('T')[0]}`, url: file_url }]
    };

    // Duplicate check: same agent + property address + closing date
    const existing = await base44.asServiceRole.entities.Transaction.filter({
      agent_email: agentEmail,
      property_address: txnData.property_address,
    });
    const isDuplicate = existing.some(t =>
      t.closing_date === txnData.closing_date &&
      t.property_address?.toLowerCase().trim() === txnData.property_address?.toLowerCase().trim()
    );
    if (isDuplicate) {
      return Response.json({
        success: 0,
        skipped: 1,
        skippedAddresses: [`${txnData.property_address} (${txnData.closing_date || 'no date'})`],
        failed: 0,
        failedAddresses: []
      });
    }

    await base44.asServiceRole.entities.Transaction.create(txnData);

    return Response.json({ success: 1, failed: 0, failedAddresses: [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
