// Base44 Core.InvokeLLM equivalent, backed by the Claude API.
//   InvokeLLM({ prompt, file_urls?, response_json_schema? }) → parsed object (schema) or string
import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import { config } from '../config.js';
import { fetchFileBytes } from './files.js';

let client = null;
const getClient = () => {
  if (!config.anthropic.apiKey) throw new Error('AI features need ANTHROPIC_API_KEY set in .env');
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
};

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

async function fileToBlocks(url) {
  const { buffer, mime, name } = await fetchFileBytes(url);
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  const lowerName = (name || url).toLowerCase();
  if (m === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }];
  }
  if (IMAGE_TYPES.includes(m)) {
    return [{ type: 'image', source: { type: 'base64', media_type: m, data: buffer.toString('base64') } }];
  }
  if (/\.(xlsx|xls|xlsm)$/.test(lowerName) || m.includes('spreadsheet') || m.includes('excel')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const text = wb.SheetNames.map(n => `### Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n');
    return [{ type: 'text', text: `File "${name || url}" (spreadsheet, as CSV):\n${text.slice(0, 400_000)}` }];
  }
  return [{ type: 'text', text: `File "${name || url}":\n${buffer.toString('utf8').slice(0, 400_000)}` }];
}

export async function invokeLLM({ prompt, file_urls, response_json_schema, max_tokens } = {}) {
  const anthropic = getClient();
  const content = [];
  for (const url of [].concat(file_urls || []).filter(Boolean)) content.push(...await fileToBlocks(url));
  content.push({ type: 'text', text: String(prompt || '') });

  const params = {
    model: config.anthropic.model,
    max_tokens: max_tokens || 16000,
    messages: [{ role: 'user', content }],
  };

  if (response_json_schema) {
    const schema = response_json_schema.type === 'object' ? response_json_schema : { type: 'object', properties: { result: response_json_schema }, required: ['result'] };
    params.tools = [{ name: 'respond', description: 'Return the answer in the required structure.', input_schema: schema }];
    params.tool_choice = { type: 'tool', name: 'respond' };
    const msg = await anthropic.messages.create(params);
    const tool = msg.content.find(b => b.type === 'tool_use');
    if (!tool) throw new Error('AI did not return structured output');
    return response_json_schema.type === 'object' ? tool.input : tool.input.result;
  }

  const msg = await anthropic.messages.create(params);
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}
