// Ported from base44/functions/onTransactionCreated/entry.ts
import { jsPDF } from 'jspdf';

export default async (req, base44) => {
  try {
    const payload = await req.json();

    const { event, data } = payload;
    if (!data) return Response.json({ ok: true });

    if (event.type === "create") {
      // Alert all admins when a new CDA is submitted
      if (data.status === "submitted") {
        const allUsers = await base44.asServiceRole.entities.User.list();
        const admins = (allUsers || []).filter(u => (u.role === 'admin' || u.role === 'staff') && u.status !== 'inactive' && u.status !== 'suspended');
        const brokerageSettingsList = await base44.asServiceRole.entities.BrokerageSettings.list();
        const brokerageSettings = brokerageSettingsList?.[0] || {};
        const brokerageName = brokerageSettings.brokerage_name || 'Back Office';
        const appUrl = process.env.APP_URL || brokerageSettings.instance_url || '';
        const reviewLink = appUrl ? `${appUrl.replace(/\/$/, '')}/AllTransactions` : null;

        // Build subject & body — use custom template if set, otherwise default
        const customTpl = brokerageSettings.email_templates?.cda_submitted;
        const replaceVars = (str) => (str || '')
          .replace(/\{\{agent_name\}\}/g, data.agent_name || data.agent_email || 'Unknown')
          .replace(/\{\{property_address\}\}/g, data.property_address || '—')
          .replace(/\{\{sale_price\}\}/g, `$${(data.sale_price || 0).toLocaleString()}`)
          .replace(/\{\{agent_commission\}\}/g, `$${(data.agent_gross_commission || 0).toLocaleString()}`)
          .replace(/\{\{closing_date\}\}/g, data.closing_date || '—');

        let emailSubject, emailBody;
        if (customTpl) {
          emailSubject = replaceVars(customTpl.subject);
          emailBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; white-space: pre-wrap;">${replaceVars(customTpl.body)}${reviewLink ? `\n\n<div style="text-align:center;margin:24px 0;"><a href="${reviewLink}" style="background:#1e3a5f;color:white;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:bold;">Review CDA &rarr;</a></div>` : ''}</div>`;
        } else {
          emailSubject = `New CDA Submitted — ${data.property_address || 'Unknown Property'}`;
          emailBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e3a5f;">New CDA Submitted — ${brokerageName}</h2>
  <p style="color: #444;">A new Commission Disbursement Authorization has been submitted and requires your review.</p>
  <div style="background: #f0f7ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0 0 6px;"><strong>Agent:</strong> ${data.agent_name || data.agent_email || 'Unknown'}</p>
    <p style="margin: 0 0 6px;"><strong>Property:</strong> ${data.property_address || '—'}</p>
    <p style="margin: 0 0 6px;"><strong>Sale Price:</strong> $${(data.sale_price || 0).toLocaleString()}</p>
    <p style="margin: 0 0 6px;"><strong>Agent Commission:</strong> $${(data.agent_gross_commission || 0).toLocaleString()}</p>
    <p style="margin: 0;"><strong>Closing Date:</strong> ${data.closing_date || '—'}</p>
  </div>
  ${reviewLink ? `<div style="text-align: center; margin: 28px 0;"><a href="${reviewLink}" style="background: #1e3a5f; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">Review CDA &rarr;</a></div>` : ''}
</div>`;
        }
        await Promise.all(admins.map(admin =>
          base44.asServiceRole.integrations.Core.SendEmail({
            to: admin.email,
            subject: emailSubject,
            body: emailBody,
          }).catch(() => {})
        ));
      }

      // Only create accounting entry if already approved (e.g. bulk import)
      if (data.status === "approved" || data.status === "paid") {
        await base44.asServiceRole.entities.AccountingEntry.create({
          transaction_id: data.id,
          agent_name: data.agent_name || "",
          agent_email: data.agent_email || "",
          property_address: data.property_address || "",
          closing_date: data.closing_date || "",
          sale_price: data.sale_price || 0,
          total_commission_amount: data.total_commission_amount || 0,
          agent_gross_commission: data.agent_gross_commission || 0,
          company_gross_commission: data.office_payment_received ? (data.company_gross_commission || 0) : 0,
          referral_fee_amount: data.referral_fee_amount || 0,
          agent_net_commission: data.agent_net_commission || 0,
          transaction_type: data.transaction_type || "",
          category: data.category || "",
          status: data.status,
        });
      }

      // Create document vault entry under transaction section
      if (data.additional_docs?.length > 0) {
        for (const doc of data.additional_docs) {
          await base44.asServiceRole.entities.Document.create({
            agent_email: data.agent_email || "",
            transaction_id: data.id,
            name: `CDA - ${data.agent_name || 'Unknown Agent'} - ${data.property_address || 'Unknown Address'} - ${data.closing_date || 'No Date'}`,
            file_url: doc.url,
            file_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            doc_section: "transaction",
            category: "commission_agreement",
            notes: `Auto-imported from CDA for ${data.property_address}`,
          });
        }
      }
    }

    if (event.type === "update") {
      // If the transaction is approved/paid, regenerate the CDA PDF and store latest URL
      if (data.status === "approved" || data.status === "paid") {
        try {
          const brokerageSettingsList = await base44.asServiceRole.entities.BrokerageSettings.list();
          const settings = brokerageSettingsList?.[0] || {};

          // Resolve approver name
          let approvedByName = '';
          if (data.approved_by) {
            const allUsers = await base44.asServiceRole.entities.User.list();
            const approver = (allUsers || []).find(u => u.email === data.approved_by);
            approvedByName = approver?.full_name || data.approved_by || '';
          }

          // Resolve agent mailing address
          let agentMailingAddress = data.agent_mailing_address;
          if (!agentMailingAddress) {
            const allAgents = await base44.asServiceRole.entities.Agent.list();
            const agent = allAgents.find(a => a.user_email?.toLowerCase() === data.agent_email?.toLowerCase()
              || a.full_name?.toLowerCase() === data.agent_name?.toLowerCase());
            agentMailingAddress = agent?.mailing_address || '';
          }

          const transaction = { ...data, approved_by_name: approvedByName, agent_mailing_address: agentMailingAddress || data.agent_mailing_address };
          const brokerageName = settings.brokerage_name || 'Signature Real Estate';
          const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const hexToRgb = (hex) => {
            const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
            return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 30, g: 58, b: 95 };
          };
          const pc = hexToRgb(settings.primary_color || '#1e3a5f');
          const sc = hexToRgb(settings.secondary_color || '#c9a84c');

          const doc = new jsPDF({ unit: 'mm', format: 'letter' });
          const PW = 215.9, PH = 279.4, ML = 10, MR = 10, contentW = PW - ML - MR;

          doc.setFillColor(pc.r, pc.g, pc.b);
          doc.rect(0, 0, PW, 30, 'F');
          if (settings.logo_url) {
            try {
              const res = await fetch(settings.logo_url);
              const ab = await res.arrayBuffer();
              const u8 = new Uint8Array(ab);
              let bin = ''; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
              const b64 = btoa(bin);
              const ext = settings.logo_url.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
              const dataUrl = `data:image/${ext.toLowerCase()};base64,${b64}`;
              const ip = doc.getImageProperties(dataUrl);
              const maxH = 22, maxW = 38;
              const ratio = Math.min(maxW / ip.width, maxH / ip.height);
              doc.addImage(dataUrl, ext, PW - MR - ip.width * ratio, 4 + (maxH - ip.height * ratio) / 2, ip.width * ratio, ip.height * ratio);
            } catch {}
          }
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(14); doc.setFont(undefined, 'bold');
          doc.text(brokerageName, ML, 12);
          doc.setFontSize(7.5); doc.setFont(undefined, 'normal');
          doc.text('COMMISSION DISBURSEMENT AUTHORIZATION (CDA)', ML, 20);
          if (settings.address || settings.phone) {
            doc.setFontSize(6.5);
            doc.text([settings.address, settings.phone].filter(Boolean).join('  |  '), ML, 26);
          }
          doc.setFillColor(sc.r, sc.g, sc.b);
          doc.rect(0, 30, PW, 2.5, 'F');
          doc.setTextColor(30, 30, 30);
          let y = 38;

          const secHeader = (title) => {
            doc.setFillColor(235, 238, 243);
            doc.rect(ML, y - 3.5, contentW, 6, 'F');
            doc.setFontSize(6.5); doc.setFont(undefined, 'bold');
            doc.setTextColor(pc.r, pc.g, pc.b);
            doc.text(title, ML + 2, y);
            doc.setTextColor(30, 30, 30); doc.setFont(undefined, 'normal');
            y += 5;
          };
          const row = (l1, v1, l2, v2) => {
            doc.setFontSize(6.8);
            doc.setFont(undefined, 'bold'); doc.text(`${l1}:`, ML + 1, y);
            doc.setFont(undefined, 'normal'); doc.text(String(v1 ?? '—'), ML + 48, y);
            if (l2) {
              doc.setFont(undefined, 'bold'); doc.text(`${l2}:`, ML + 105, y);
              doc.setFont(undefined, 'normal'); doc.text(String(v2 ?? '—'), ML + 153, y);
            }
            y += 5;
          };

          secHeader('PROPERTY INFORMATION');
          row('Property Address', transaction.property_address);
          row('Transaction Type', transaction.working_with || '—', 'Closing Date', transaction.closing_date || '—');
          row('Sale Price', fmt(transaction.sale_price), 'Buyer(s)', transaction.buyer_name || '—');
          row('Seller(s)', transaction.seller_name || '—', 'Co-Op Agent', transaction.coop_agent || '—');
          y += 1;

          secHeader('COMMISSION BREAKDOWN');
          row('Agent Gross Comm.', fmt(transaction.agent_gross_commission), 'Office Gross Comm.', fmt(transaction.company_gross_commission));
          row('Commission %', transaction.commission_percentage ? `${transaction.commission_percentage}%` : '—', 'Total Commission', fmt(transaction.total_commission_amount));
          if (transaction.office_split_percentage || transaction.office_split_flat) {
            row('Office Split %', transaction.office_split_percentage ? `${transaction.office_split_percentage}%` : '—', 'Office Split $ (Flat)', fmt(transaction.office_split_flat));
          }
          if (transaction.total_referral_amount > 0) row('Total Referral Fees', fmt(transaction.total_referral_amount));
          if (transaction.admin_fee_amount > 0) row('Admin Fee $', fmt(transaction.admin_fee_amount), 'Admin Fee Payable To', transaction.admin_fee_payable_to || '—');
          if (transaction.client_concession > 0) row('Client Concession $', fmt(transaction.client_concession));

          y += 1;
          doc.setFillColor(pc.r, pc.g, pc.b);
          doc.rect(ML, y - 2, contentW, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(7.5); doc.setFont(undefined, 'bold');
          doc.text('AGENT NET COMMISSION:', ML + 2, y + 3.5);
          doc.setFontSize(9);
          doc.text(fmt(transaction.agent_net_commission), ML + 148, y + 3.8);
          doc.setTextColor(30, 30, 30); doc.setFont(undefined, 'normal');
          y += 10;

          secHeader('CHECK DISBURSEMENT INSTRUCTIONS');
          const mailAddr = transaction.agent_mailing_address || '(No address on file)';
          const officeAddress = settings.address || '(See brokerage settings)';
          const allChecks = [
            { label: 'Agent Commission', payable: transaction.commission_check_payable_to || transaction.agent_name || '', address: mailAddr, amount: transaction.agent_net_commission || 0, color: [220, 233, 255] },
            { label: 'Office / Brokerage', payable: brokerageName, address: officeAddress, amount: transaction.company_gross_commission || 0, color: [218, 245, 228] },
            ...[
              { name: transaction.referral_1_name, amount: transaction.referral_1_amount, address: transaction.referral_1_mailing_address },
              { name: transaction.referral_2_name, amount: transaction.referral_2_amount, address: transaction.referral_2_mailing_address },
              { name: transaction.referral_3_name, amount: transaction.referral_3_amount, address: transaction.referral_3_mailing_address },
              { name: transaction.referral_4_name, amount: transaction.referral_4_amount, address: transaction.referral_4_mailing_address },
            ].filter(r => r.name).map(r => ({ label: 'Referral / Split', payable: r.name, address: r.address || '(No address)', amount: r.amount || 0, color: [255, 248, 220] }))
          ];

          doc.setFillColor(pc.r, pc.g, pc.b);
          doc.rect(ML, y - 1, contentW, 5.5, 'F');
          doc.setFontSize(5.8); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
          doc.text('CHECK TYPE', ML + 1, y + 3);
          doc.text('PAYABLE TO', ML + 40, y + 3);
          doc.text('MAIL TO', ML + 98, y + 3);
          doc.text('AMOUNT', ML + 166, y + 3);
          y += 6;

          const lineH = 6.5 * (25.4 / 72) * 1.1;
          for (const chk of allChecks) {
            doc.setFontSize(6.2); doc.setFont(undefined, 'normal');
            const addrLines = doc.splitTextToSize(String(chk.address || ''), 62);
            const payLines = doc.splitTextToSize(String(chk.payable || ''), 52);
            const rowH = Math.max(7, Math.max(addrLines.length, payLines.length) * lineH + 4);
            doc.setFillColor(chk.color[0], chk.color[1], chk.color[2]);
            doc.rect(ML, y - 1, contentW, rowH, 'F');
            doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.15);
            doc.rect(ML, y - 1, contentW, rowH);
            const ty = y + 3;
            doc.setFont(undefined, 'bold'); doc.setTextColor(30, 30, 30);
            doc.text(chk.label, ML + 1, ty);
            doc.setFont(undefined, 'normal');
            payLines.forEach((l, i) => doc.text(l, ML + 40, ty + i * lineH));
            addrLines.forEach((l, i) => doc.text(l, ML + 98, ty + i * lineH));
            doc.setFont(undefined, 'bold');
            doc.text(fmt(chk.amount), ML + 166, ty);
            y += rowH;
          }
          y += 2;

          secHeader('PARTIES & TITLE COMPANY');
          row('Agent Name', transaction.agent_name || '—', 'Agent Email', transaction.agent_email || '—');
          row('Title Company', transaction.title_company_name || '—', 'Title Phone', transaction.title_company_phone || '—');
          row('Title Email', transaction.title_company_email || '—');
          y += 1;

          secHeader('AUTHORIZATION');
          y += 2;

          const approvedDate = transaction.approved_date
            ? new Date(transaction.approved_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          const sigUrl = settings.signature_url;
          const sigBoxY = y;

          if (sigUrl) {
            try {
              const res = await fetch(sigUrl);
              const ab = await res.arrayBuffer();
              const u8 = new Uint8Array(ab);
              let bin = ''; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
              const b64 = btoa(bin);
              const ext = sigUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
              doc.addImage(`data:image/${ext.toLowerCase()};base64,${b64}`, ext, ML, sigBoxY, 55, 13);
            } catch {
              if (approvedByName) {
                doc.setFont('times', 'bolditalic'); doc.setFontSize(15);
                doc.setTextColor(pc.r, pc.g, pc.b);
                doc.text(approvedByName, ML, sigBoxY + 10);
                doc.setFont(undefined, 'normal'); doc.setTextColor(30, 30, 30);
              }
            }
          } else if (approvedByName) {
            doc.setFont('times', 'bolditalic'); doc.setFontSize(15);
            doc.setTextColor(pc.r, pc.g, pc.b);
            doc.text(approvedByName, ML, sigBoxY + 10);
            doc.setFont(undefined, 'normal'); doc.setTextColor(30, 30, 30);
          }

          doc.setDrawColor(160, 160, 160);
          doc.line(ML, sigBoxY + 14, ML + 80, sigBoxY + 14);
          doc.setFontSize(6.2); doc.setTextColor(100, 100, 100);
          doc.text('Authorized Broker / Admin Signature', ML, sigBoxY + 18);
          doc.setTextColor(30, 30, 30);
          if (approvedByName) {
            doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(50, 50, 50);
            doc.text(`Digitally approved by: ${approvedByName}`, ML + 100, sigBoxY + 7);
            doc.setFont(undefined, 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
            doc.text(`Approval Date: ${approvedDate}`, ML + 100, sigBoxY + 13);
            doc.setTextColor(30, 30, 30);
          }

          const footerY = PH - 14;
          doc.setFillColor(245, 245, 245);
          doc.rect(0, footerY, PW, 14, 'F');
          doc.setFillColor(sc.r, sc.g, sc.b);
          doc.rect(0, footerY, PW, 1, 'F');
          const officeParts = [brokerageName, settings.address, settings.phone, settings.email, settings.website].filter(Boolean);
          doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
          doc.text(officeParts.join('  ·  '), ML, footerY + 6);
          doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, ML, footerY + 11);
          doc.setTextColor(sc.r, sc.g, sc.b); doc.setFont(undefined, 'bold');
          doc.text('CONFIDENTIAL – FOR REAL ESTATE CLOSING USE ONLY', PW / 2, footerY + 8.5, { align: 'center' });

          const pdfBytes = doc.output('arraybuffer');
          const uint8 = new Uint8Array(pdfBytes);
          const blob = new Blob([uint8], { type: 'application/pdf' });
          const filename = `CDA_${data.id}.pdf`;
          const file = new File([blob], filename, { type: 'application/pdf' });
          const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          if (uploaded?.file_url) {
            await base44.asServiceRole.entities.Transaction.update(data.id, { latest_cda_pdf_url: uploaded.file_url });
          }
        } catch (e) {
          console.error('[CDA PDF regen error]', e?.message || e);
        }
      }

      const entries = await base44.asServiceRole.entities.AccountingEntry.filter({ transaction_id: data.id });

      if (entries.length > 0) {
        // Sync field updates to existing accounting entry
        const newStatus = data.status === "paid" ? "paid" : "approved";
        await base44.asServiceRole.entities.AccountingEntry.update(entries[0].id, {
          status: newStatus,
          closing_date: data.closing_date || entries[0].closing_date,
          sale_price: data.sale_price || entries[0].sale_price,
          agent_gross_commission: data.agent_gross_commission || entries[0].agent_gross_commission,
          company_gross_commission: data.office_payment_received ? (data.company_gross_commission || 0) : 0,
          agent_net_commission: data.agent_net_commission || entries[0].agent_net_commission,
          property_address: data.property_address || entries[0].property_address,
          category: data.category || entries[0].category,
        });
      } else if (data.status === "approved" || data.status === "paid") {
        // Create accounting entry now that it's been approved
        await base44.asServiceRole.entities.AccountingEntry.create({
          transaction_id: data.id,
          agent_name: data.agent_name || "",
          agent_email: data.agent_email || "",
          property_address: data.property_address || "",
          closing_date: data.closing_date || "",
          sale_price: data.sale_price || 0,
          total_commission_amount: data.total_commission_amount || 0,
          agent_gross_commission: data.agent_gross_commission || 0,
          company_gross_commission: data.office_payment_received ? (data.company_gross_commission || 0) : 0,
          referral_fee_amount: data.referral_fee_amount || 0,
          agent_net_commission: data.agent_net_commission || 0,
          transaction_type: data.transaction_type || "",
          category: data.category || "",
          status: data.status,
        });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
