// Ported from base44/functions/backupData/entry.ts
import { zipSync, strToU8 } from 'fflate';

export default async (req, base44) => {
  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'restore') {
      let restoreData = body.data;

      // If a file_url was provided, fetch the JSON from it (avoids large request body)
      if (!restoreData && body.file_url) {
        const fileRes = await fetch(body.file_url);
        restoreData = await fileRes.json();
      }

      const regularEntities = ['Transaction', 'AccountingEntry', 'Expense', 'Agent', 'Document', 'TransactionCategory', 'CommunityPost', 'Vendor', 'DocumentFeedback', 'SupportTicket'];
      const results = {};

      for (const entity of regularEntities) {
        if (!restoreData[entity]) continue;
        let success = 0;
        for (const record of restoreData[entity]) {
          // Keep original IDs so links between records (transaction_id etc.) survive; skip ones already present.
          if (base44.asServiceRole.restoreRecord(entity, record)) success++;
        }
        results[entity] = success;
      }

      if (restoreData['BrokerageSettings']?.length > 0) {
        const [backupSettings] = restoreData['BrokerageSettings'];
        const { id: _id, created_date, updated_date, created_by, ...settingsFields } = backupSettings;
        const existingList = await base44.asServiceRole.entities.BrokerageSettings.list();
        if (existingList?.length > 0) {
          await base44.asServiceRole.entities.BrokerageSettings.update(existingList[0].id, settingsFields);
        } else {
          await base44.asServiceRole.entities.BrokerageSettings.create(settingsFields);
        }
        results['BrokerageSettings'] = 1;
      }

      return Response.json({ success: true, results });
    }

    if (action === 'backup') {
      // Fetch all entity data
      const [transactions, accountingEntries, expenses, agents, documents, categories, brokerageSettings, communityPosts, vendors, documentFeedback, supportTickets] = await Promise.all([
        base44.asServiceRole.entities.Transaction.list('-created_date', 5000),
        base44.asServiceRole.entities.AccountingEntry.list('-created_date', 5000),
        base44.asServiceRole.entities.Expense.list('-created_date', 5000),
        base44.asServiceRole.entities.Agent.list('-created_date', 5000),
        base44.asServiceRole.entities.Document.list('-created_date', 5000),
        base44.asServiceRole.entities.TransactionCategory.list('sort_order', 1000),
        base44.asServiceRole.entities.BrokerageSettings.list(),
        base44.asServiceRole.entities.CommunityPost.list('-created_date', 5000),
        base44.asServiceRole.entities.Vendor.list('-created_date', 1000),
        base44.asServiceRole.entities.DocumentFeedback.list('-created_date', 5000),
        base44.asServiceRole.entities.SupportTicket.list('-created_date', 5000),
      ]);

      const backupData = {
        Transaction: transactions || [],
        AccountingEntry: accountingEntries || [],
        Expense: expenses || [],
        Agent: agents || [],
        Document: documents || [],
        TransactionCategory: categories || [],
        BrokerageSettings: brokerageSettings || [],
        CommunityPost: communityPosts || [],
        Vendor: vendors || [],
        DocumentFeedback: documentFeedback || [],
        SupportTicket: supportTickets || [],
        _meta: {
          backup_date: new Date().toISOString(),
          version: '2.0',
        }
      };

      const files = {};

      // Add JSON data file
      files['backup_data.json'] = strToU8(JSON.stringify(backupData, null, 2));

      // Map doc_section + category to the "Agent AI Staff" folder structure
      const SECTION_LABEL_MAP = {
        transaction: 'Transaction Records',
        office: 'Office Docs',
      };

      const CATEGORY_LABEL_MAP = {
        purchase_agreement: 'Purchase Agreements',
        counter_proposal: 'Counter Proposals',
        addendum: 'Addendums',
        commission_agreement: 'Commission Agreements',
        id_verification: 'ID Verification',
        agent_signup_form: 'Signup Forms',
        form_1099: '1099 Forms',
        contractor_agreement: 'Contractor Agreements',
        policy_manual: 'Policies & Procedures',
        office_announcement: 'Announcements',
        other: 'Archives',
      };

      // Build document manifest with file URLs (no file downloads — avoids memory limit)
      const docManifest = [];

      for (const doc of (documents || [])) {
        const sectionLabel = SECTION_LABEL_MAP[doc.doc_section] || 'Transaction Records';
        const categoryLabel = CATEGORY_LABEL_MAP[doc.category] || 'Archives';

        let agentFolder = '';
        if (doc.doc_section === 'transaction' || !doc.doc_section) {
          agentFolder = doc.agent_email
            ? doc.agent_email.split('@')[0]
            : (agents || []).find(a => a.user_email === doc.agent_email)?.full_name || 'General';
        }

        const folderPath = agentFolder
          ? `Agent AI Staff/${sectionLabel}/${agentFolder}/${categoryLabel}`
          : `Agent AI Staff/${sectionLabel}/${categoryLabel}`;

        const rawName = doc.name || `document_${doc.id}`;
        const urlExt = doc.file_url ? doc.file_url.split('?')[0].split('.').pop().toLowerCase() : '';
        const hasExt = rawName.includes('.');
        const fileName = hasExt ? rawName : (urlExt ? `${rawName}.${urlExt}` : rawName);

        docManifest.push({
          id: doc.id,
          name: doc.name,
          file_url: doc.file_url,
          folder_path: folderPath,
          full_path: `${folderPath}/${fileName}`,
        });
      }

      files['document_manifest.json'] = strToU8(JSON.stringify(docManifest, null, 2));

      // Create zip
      const zipped = zipSync(files);
      // Convert large Uint8Array to base64 safely (avoid stack overflow from spread)
      let base64 = '';
      const chunkSize = 8192;
      for (let i = 0; i < zipped.length; i += chunkSize) {
        base64 += String.fromCharCode(...zipped.subarray(i, i + chunkSize));
      }
      base64 = btoa(base64);

      return Response.json({
        success: true,
        zip_base64: base64,
        document_manifest: docManifest,
        summary: {
          transactions: transactions?.length || 0,
          accountingEntries: accountingEntries?.length || 0,
          expenses: expenses?.length || 0,
          agents: agents?.length || 0,
          documents: documents?.length || 0,
          categories: categories?.length || 0,
          communityPosts: communityPosts?.length || 0,
          vendors: vendors?.length || 0,
          documentFeedback: documentFeedback?.length || 0,
          supportTickets: supportTickets?.length || 0,
        }
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
