export const categories = ['Discharge summary', 'Final bill', 'Payment receipt', 'Investigation report', 'Policy copy', 'KYC', 'Prescription', 'Claim form', 'Other'];
export const defaultTemplate = `Dear {{patient_name}},\n\nYour insurer {{insurer}} has requested additional information for claim {{claim_id}}.\n\n{{requests}}\n\n{{available}}\n\nPlease share the requested documents with your care coordinator, quoting your patient ID {{patient_id}}.\n\nThank you,\nCare.fi Claims Team`;
export type DocumentRecord = { id: string; name: string; category: string; text: string; status: string; claim: string; [key: string]: any };
export type Point = { request: string; status: 'available' | 'needed' | 'review'; documentIds: string[]; evidence: string; reason: string; patientRequest: string };
const patterns: [string, RegExp][] = [
 ['Discharge summary', /discharge\s*(summary|card|report)/i], ['Final bill', /(?:final|itemi[sz]ed|detailed|hospital|consolidated)\s*(?:hospital\s*)?bill|bill\s*break.?up/i],
 ['Payment receipt', /payment\s*(?:receipt|proof)|paid\s*receipt|receipt/i], ['Investigation report', /investigation|lab(?:oratory)?\s*(?:report|result)|diagnostic|blood\s*(?:test|report)|(?:ct|mri|x.?ray)\s*(?:scan|report)/i],
 ['Policy copy', /policy\s*(?:copy|document|schedule)|insurance\s*policy/i], ['KYC', /kyc|identity\s*proof|aadhaar|aadhar|pan\s*card/i],
 ['Prescription', /prescription/i], ['Claim form', /claim\s*form/i],
];
export function classify(text: string) { return patterns.find(([, re]) => re.test(text))?.[0] || 'Other'; }
export function fallbackAnalyze(text: string, docs: DocumentRecord[], claim: string): Point[] {
  const lines = text.split(/\n+|;|(?<=[.!?])\s+/).map(s=>s.replace(/^\s*(?:[-•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  return lines.filter(s => patterns.some(([,re])=>re.test(s)) || /provide|submit|clarif|confirm|required|explain|please|request/i.test(s)).flatMap(line => {
    const found = patterns.filter(([,re])=>re.test(line));
    if (!found.length) return [{request:line,status:'review' as const,documentIds:[],evidence:'',reason:'This clarification needs semantic analysis. Configure the analysis provider to resolve it.',patientRequest:line}];
    return found.map(([category]) => {
      const candidates = docs.filter(d=>d.category===category && d.status==='ready' && (!d.claim || d.claim===claim));
      const available = candidates.find(d=>d.text.length>15);
      return {request:found.length>1?`${line} [${category}]`:line,status:'review' as Point['status'],documentIds:available?[available.id]:[],evidence:available?available.text.slice(0,220):'',reason:available?'A candidate exists in the locker; semantic verification is required before sending.':`No verified ${category.toLowerCase()} was found. Semantic verification is required before sending.`,patientRequest:`Please share your ${category.toLowerCase()}.`};
    });
  });
}
export function validatePoints(raw: any, docs: DocumentRecord[]): Point[] {
  if(!Array.isArray(raw) || !raw.length || raw.length>80) throw new Error('Analysis returned no usable query points.');
  return raw.map((p:any)=>{
    if(!p || typeof p.request!=='string' || !p.request.trim() || !['available','needed','review'].includes(p.status) || typeof p.reason!=='string') throw new Error('Invalid analysis response.');
    const ids = Array.isArray(p.documentIds)? p.documentIds.filter((id:any)=>typeof id==='string' && docs.some(d=>d.id===id && d.status==='ready')):[];
    let status = p.status;
    const evidence = typeof p.evidence==='string'?p.evidence:'';
    if(status==='available' && (!ids.length || !evidence || !ids.some((id:string)=>docs.find(d=>d.id===id)?.text.toLowerCase().includes(evidence.toLowerCase())))) status='review';
    return {request:p.request.slice(0,3000),status,documentIds:ids,evidence,reason:p.reason,patientRequest:typeof p.patientRequest==='string'?p.patientRequest:p.request};
  });
}
export function renderMessage(template: string, patient: any, points: Point[]) {
  const needed = points.filter(p=>p.status==='needed');
  const values: Record<string,string> = {patient_name:patient.name,insurer:patient.insurer,claim_id:patient.claim,patient_id:patient.patientId,
    requests: needed.length ? 'Please provide:\n'+needed.map((p,i)=>`${i+1}. ${p.patientRequest}\n   Why: ${p.reason}`).join('\n') : 'No additional documents are needed from you at this time.',
    available: points.some(p=>p.status==='available') ? 'Already available in your locker (no need to resend):\n'+points.filter(p=>p.status==='available').map(p=>`• ${p.request}`).join('\n') : ''};
  return template.replace(/\{\{(\w+)\}\}/g,(_,k)=>values[k]??'').replace(/\n{3,}/g,'\n\n');
}
