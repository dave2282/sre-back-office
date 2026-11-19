// Ported from base44/functions/downloadDocZip/entry.ts
import { zipSync, strToU8 } from 'fflate';

export default async (req, base44) => {
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { docs, transactions } = await req.json();
    if (!docs || docs.length === 0) return Response.json({ error: 'No docs provided' }, { status: 400 });

    const sanitize = (str) => (str || 'documents').replace(/[/\\:*?"<>|]/g, '_').trim();

    const files = {};
    const usedNames = {};

    await Promise.allSettled(docs.map(async (doc) => {
      if (!doc.file_url) return;
      
      // Get transaction address or agent name for folder structure
      let folderPath = 'Uncategorized';
      if (doc.transaction_id && transactions) {
        const txn = transactions.find(t => t.id === doc.transaction_id);
        if (txn?.property_address) {
          folderPath = sanitize(txn.property_address);
        }
      } else if (doc.agent_email && doc.doc_section === 'office') {
        // For agent documents, use agent email as folder
        folderPath = sanitize(doc.agent_email);
      }
      
      const rawName = doc.name || `document_${doc.id}`;
      const urlExt = doc.file_url.split('?')[0].split('.').pop().toLowerCase();
      const hasExt = rawName.includes('.');
      let fileName = hasExt ? rawName : (urlExt ? `${rawName}.${urlExt}` : rawName);

      // Deduplicate filenames
      const key = `${folderPath}/${fileName}`;
      if (usedNames[key]) {
        usedNames[key]++;
        const parts = fileName.split('.');
        if (parts.length > 1) {
          fileName = `${parts.slice(0, -1).join('.')}_${usedNames[key]}.${parts[parts.length - 1]}`;
        } else {
          fileName = `${fileName}_${usedNames[key]}`;
        }
      } else {
        usedNames[key] = 1;
      }

      const res = await fetch(doc.file_url);
      if (res.ok) {
        files[`${folderPath}/${fileName}`] = new Uint8Array(await res.arrayBuffer());
      }
    }));

    const zipped = zipSync(files);
    let base64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < zipped.length; i += chunkSize) {
      base64 += String.fromCharCode(...zipped.subarray(i, i + chunkSize));
    }
    base64 = btoa(base64);

    return Response.json({ success: true, zip_base64: base64 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
