export const LINE_QUERY='ledger_lines';
export const VOUCHER_QUERY='voucher_headers';
export const TABS=[
  {id:'overview',label:'Overview',filterIds:['unit','date']},
  {id:'spend',label:'Spend analysis',filterIds:['unit','date','service','account']},
  {id:'parties',label:'Counterparties',filterIds:['unit','date']},
  {id:'tax',label:'Tax & TDS',filterIds:['unit','date']},
  {id:'reconciliation',label:'Reconciliation',filterIds:['unit','date']},
  {id:'quality',label:'Data quality',filterIds:['unit','date']},
  {id:'transactions',label:'Transactions',filterIds:['unit','date','service']},
  {id:'report',label:'Full report',filterIds:[]},
];
export const ISSUE_DEFS=[
  {code:'net_mismatch',label:'Net amount requires reconciliation',severity:'High',grain:'Vouchers',detail:'Absolute Net minus Gross minus signed TDS is above ₹1. These are review candidates, not established loss.'},
  {code:'unvalued_voucher',label:'Whole voucher has no amounts',severity:'High',grain:'Vouchers',detail:'All financial amounts are unreported; the value is unknown.'},
  {code:'gst_components',label:'GST components do not match Total GST',severity:'High',grain:'Detail rows',detail:'CGST + SGST + IGST differs from recorded Total GST by more than ₹1.'},
  {code:'tax_label_review',label:'Exempted label carries GST',severity:'Review',grain:'Detail rows',detail:'ERP tax-label semantics need confirmation; this is not a statutory tax finding.'},
  {code:'department_missing',label:'Department is blank',severity:'High',grain:'Detail rows',detail:'Department and cost-centre ownership cannot be analysed.'},
  {code:'hsn_missing',label:'HSN/SAC is blank or a placeholder',severity:'Medium',grain:'Monetary rows',detail:'NA, Na, dash and blank values are treated as unreported codes.'},
  {code:'gstin_missing',label:'Party GSTIN is blank or a placeholder',severity:'Medium',grain:'Monetary rows',detail:'Some payees can legitimately lack a registration; registration status must be classified.'},
  {code:'gst_without_gstin',label:'GST recorded without a party GSTIN',severity:'Medium',grain:'Detail rows',detail:'Recover supporting supplier identity and bill evidence.'},
  {code:'hsn_format',label:'HSN/SAC digit length needs review',severity:'Medium',grain:'Detail rows',detail:'Non-placeholder code does not have 4, 6 or 8 digits. Do not automatically pad or truncate.'},
  {code:'gstin_format',label:'GSTIN format or registration type needs review',severity:'Medium',grain:'Detail rows',detail:'Case-sensitive shape screening only; not proof of invalid registration.'},
  {code:'bill_date_missing',label:'Bill date is missing',severity:'Medium',grain:'Vouchers',detail:'Bill-to-posting lag is unavailable for these vouchers.'},
  {code:'old_bill_year',label:'Bill year is earlier than 2020',severity:'Medium',grain:'Vouchers',detail:'The supplied dates are preserved. Two source years are 2002.'},
  {code:'prior_period_bill',label:'Bill predates April 2026',severity:'Review',grain:'Detail rows',detail:'May be legitimate late posting; inspect cutoff evidence.'},
  {code:'negative_adjustment',label:'Negative gross adjustment',severity:'Review',grain:'Detail rows',detail:'Retained with its sign; identify reversals, credits and rounding adjustments.'},
  {code:'taxable_no_gst',label:'Taxable label has no recorded GST',severity:'Review',grain:'Detail rows',detail:'Tax-label meaning and the supporting bill need confirmation.'},
  {code:'rate_40',label:'A 40% rate is recorded',severity:'Review',grain:'Detail rows',detail:'Source rate is preserved; validate the original bill and configuration before any conclusion.'},
];
export const money=n=>n==null?'Unavailable':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
export const compactMoney=n=>n==null?'Unavailable':Math.abs(n)>=1e7?`₹${(n/1e7).toFixed(2)} Cr`:Math.abs(n)>=1e5?`₹${(n/1e5).toFixed(2)} L`:money(n);
export const number=n=>n==null?'Unavailable':Number(n).toLocaleString('en-IN');
export const percent=n=>n==null?'Unavailable':n>0&&n<0.1?'<0.1%':`${Number(n).toFixed(1)}%`;
export const sumKnown=(rows,field)=>{let total=0,has=false;for(const r of rows){if(r[field]!=null&&Number.isFinite(r[field])){total+=r[field];has=true;}}return has?total:null;};
export const numericSum=(rows,field)=>sumKnown(rows,field)??0;
export const median=values=>{const x=values.filter(v=>Number.isFinite(v)).sort((a,b)=>a-b);return x.length?x.length%2?x[(x.length-1)/2]:(x[x.length/2-1]+x[x.length/2])/2:null;};
export const unique=(rows,field)=>new Set(rows.map(r=>r[field]).filter(v=>v!=null&&v!=='')).size;
export const blank=x=>x==null||['','-','NA','N/A','NIL'].includes(String(x).trim().toUpperCase());
export function groupLines(rows,field){
  const groups=new Map();for(const r of rows){const label=r[field]==null||r[field]===''?'Unreported':String(r[field]);if(!groups.has(label))groups.set(label,[]);groups.get(label).push(r);}
  const total=sumKnown(rows,'gross');
  return [...groups].map(([label,items])=>({label,rows:items.length,vouchers:unique(items,'voucherId'),parties:unique(items,'party'),basic:sumKnown(items,'basic'),gst:sumKnown(items,'gst'),gross:sumKnown(items,'gross'),grossLakh:sumKnown(items,'gross')==null?null:sumKnown(items,'gross')/1e5,gstLakh:sumKnown(items,'gst')==null?null:sumKnown(items,'gst')/1e5,sharePct:total>0?(sumKnown(items,'gross')??0)/total*100:null,units:[...new Set(items.map(r=>r.unit))].sort().join(', '),taxRegistrations:unique(items,'partyTaxKey')})).sort((a,b)=>(b.gross??-Infinity)-(a.gross??-Infinity));
}
export function monthRows(rows){
  return groupLines(rows,'month').sort((a,b)=>a.label.localeCompare(b.label)).map(r=>({...r,date:r.label,month:new Date(r.label+'T00:00:00Z').toLocaleDateString('en-IN',{month:'short',year:'numeric',timeZone:'UTC'})}));
}
export function monthlyByUnit(rows){
  const grouped=new Map();for(const r of rows){const key=r.month+'|'+r.unit;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);}
  return [...grouped.values()].map(x=>({date:x[0].month,unit:x[0].unit,grossLakh:sumKnown(x,'gross')==null?null:sumKnown(x,'gross')/1e5,gstLakh:sumKnown(x,'gst')==null?null:sumKnown(x,'gst')/1e5})).sort((a,b)=>a.date.localeCompare(b.date)||a.unit.localeCompare(b.unit));
}
export function scopedHeaders(lines,headers){const ids=new Set(lines.map(r=>r.voucherId));return headers.filter(v=>ids.has(v.id));}
export function repeatedBills(headers){
  const groups=new Map();for(const v of headers){if(!v.bill)continue;const k=[v.unit,v.partyTaxKey||v.party.toUpperCase(),v.bill.trim().toUpperCase(),v.billDate].join('|');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(v);}
  return [...groups.values()].filter(x=>x.length>1).map(x=>({unit:x[0].unit,party:x[0].party,bill:x[0].bill,billDate:x[0].billDate,vouchers:x.length,gross:sumKnown(x,'gross'),sameGross:new Set(x.map(r=>r.gross?.toFixed(2))).size===1?'Yes':'No',voucherIds:x.map(v=>v.id)}));
}
export function aliases(rows){
  const groups=new Map();for(const r of rows){if(!r.partyTaxKey)continue;if(!groups.has(r.partyTaxKey))groups.set(r.partyTaxKey,new Set());groups.get(r.partyTaxKey).add(r.party);}
  return [...groups].filter(([,names])=>names.size>1).map(([id,names])=>({id,names:[...names].sort().join(' / '),nameCount:names.size,finding:'Same recorded tax identifier. Confirm the identity relationship before merging.'}));
}
export function qualityFindings(lines,headers){
  return ISSUE_DEFS.map(def=>{
    let count,population,affected;
    if(def.code==='net_mismatch'){affected=headers.filter(v=>v.reconStatus==='Review net');count=affected.length;population=headers.filter(v=>v.hasAmounts).length;}
    else if(def.code==='unvalued_voucher'){affected=headers.filter(v=>!v.hasAmounts);count=affected.length;population=headers.length;}
    else{affected=lines.filter(r=>r.flagCodes.includes(def.code));count=def.grain==='Vouchers'?unique(affected,'voucherId'):affected.length;population=def.grain==='Vouchers'?headers.length:def.grain==='Monetary rows'?lines.filter(r=>r.hasAmounts).length:lines.length;}
    return {...def,count,population,ratePct:population?count/population*100:null,gross:sumKnown(affected,'gross')};
  });
}
export function buildModel(lines,headers){
  const vouchers=scopedHeaders(lines,headers),exceptions=vouchers.filter(v=>v.reconStatus==='Review net'),monetary=vouchers.filter(v=>v.hasAmounts),unvalued=vouchers.filter(v=>!v.hasAmounts);
  const partyRows=groupLines(lines,'party'),gross=sumKnown(lines,'gross');
  const units=groupLines(lines,'unit').map(r=>{const vs=vouchers.filter(v=>v.unit===r.label);return {...r,netExceptions:vs.filter(v=>v.reconStatus==='Review net').length,unvalued:vs.filter(v=>!v.hasAmounts).length};});
  const capitalLines=lines.filter(r=>['Capital Work in Progress','Capital WIP'].includes(r.account));
  return {lines,vouchers,exceptions,monetary,unvalued,gross,basic:sumKnown(lines,'basic'),gst:sumKnown(lines,'gst'),tds:sumKnown(vouchers,'tds'),net:sumKnown(vouchers,'net'),parties:partyRows,units,months:monthRows(lines),unitMonths:monthlyByUnit(lines),accounts:groupLines(lines,'account'),subaccounts:groupLines(lines,'subaccount'),services:groupLines(lines,'service'),tax:groupLines(lines,'taxType'),rates:groupLines(lines,'rate'),quality:qualityFindings(lines,vouchers),aliases:aliases(lines),repeats:repeatedBills(vouchers),medianLag:median(vouchers.map(v=>v.lagDays)),netExceptionPct:monetary.length?exceptions.length/monetary.length*100:null,netDifference:sumKnown(exceptions,'netDifference'),absoluteDifference:monetary.length?exceptions.reduce((s,v)=>s+Math.abs(v.netDifference),0):null,capitalGross:capitalLines.length?sumKnown(capitalLines,'gross'):gross==null?null:0,top10Share:gross>0?numericSum(partyRows.slice(0,10),'gross')/gross*100:null};
}
export function filterIssue(lines,code,headers){
  if(!code||code==='all')return lines;
  if(code==='unvalued_voucher'){const ids=new Set(headers.filter(v=>!v.hasAmounts).map(v=>v.id));return lines.filter(r=>ids.has(r.voucherId));}
  return lines.filter(r=>r.flagCodes.includes(code));
}
export function csvText(rows,fields){
  const cell=value=>{let v=value==null?'':Array.isArray(value)?value.join('; '):String(value);if(typeof value==='string'&&/^[=+\-@]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};
  return '\ufeff'+[fields.map(f=>cell(f.label)).join(','),...rows.map(row=>fields.map(f=>cell(row[f.field])).join(','))].join('\r\n');
}
