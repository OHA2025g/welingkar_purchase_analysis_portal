import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {Button,DataComponent,DataTable,Dialog,Dropdown,EvidenceChart,Filters,MetricCard,RichNarrative,SectionHeader,useDataApp,useDashboardTabs} from '../../data-app-public.jsx';
import {ReportContent} from '../report/ReportContent.jsx';
import {LINE_QUERY,VOUCHER_QUERY,TABS,ISSUE_DEFS,buildModel,filterIssue,groupLines,monthRows,sumKnown,numericSum,money,compactMoney,number,percent,unique,csvText} from './portal-model.js';

const col=(field,label,format)=>({field,label,...(format?{renderCell:v=>format(v)}:{})});
const rowsFormat=x=>Array.isArray(x)?x.join(', '):x;
const sourceMoney=x=>x==null?'Not recorded':money(x);
const ISSUE_LABELS=Object.fromEntries(ISSUE_DEFS.map(x=>[x.code,x.label]));
const TableRowsContext=createContext(null);
const lineColumns=[col('unit','Unit'),col('postingDate','Posting date'),col('voucher','Voucher'),col('party','Party'),col('account','Account head'),col('subaccount','Sub-account'),col('gross','Recorded gross',sourceMoney),col('gst','GST',sourceMoney),col('sourceRow','Excel row',number)];
const voucherColumns=[col('unit','Unit'),col('voucher','Voucher'),col('party','Party'),col('postingDate','Posting date'),col('gross','Gross',sourceMoney),col('tds','Signed TDS',sourceMoney),col('net','Recorded net',sourceMoney),col('netDifference','Net difference',sourceMoney),col('reconStatus','Check status')];
const categoryColumns=[col('label','Source classification'),col('vouchers','Vouchers',number),col('rows','Detail rows',number),col('gross','Recorded gross',money),col('sharePct','Gross share',percent)];

function EvidenceTable({id,title,queryId=LINE_QUERY,rows,sourceRows,columns,toolbarControls,onSelect,actionLabel,searchable=true,selectedRowKey=null}){
  const {visible}=useDataApp();const [search,setSearch]=useState('');
  const needle=search.trim().toLocaleLowerCase();
  const displayRows=rows.filter(r=>!needle||Object.values(r).some(v=>v!=null&&String(v).toLocaleLowerCase().includes(needle))).map((r,i)=>({...r,portalRowId:r.id??r.label??r.voucher??[r.unit,r.party,r.bill,i].join('|')}));
  if(!visible(id))return null;
  const rawIds=new Set(displayRows.map(r=>r.id).filter(Boolean));
  const sourceIds=new Set(sourceRows.map(r=>r.id).filter(Boolean));
  const evidence=needle&&rows.every(r=>r.id&&sourceIds.has(r.id))?sourceRows.filter(r=>rawIds.has(r.id)):sourceRows;
  return <TableRowsContext.Provider value={displayRows}><DataComponent id={id} title={title} queryId={queryId} kind="table" variant="card" displayRows={displayRows} sourceRows={evidence}>
    <DataTable rows={displayRows} columns={columns} label={title} compactNumbers={false} searchable={false} toolbarControls={<>{searchable&&<input className="wk-search" type="search" placeholder="Search records" aria-label={'Search '+title} value={search} onChange={e=>setSearch(e.target.value)}/>} {toolbarControls}</>}
      rowKey="portalRowId" selectedRowKey={selectedRowKey} onRowSelect={onSelect} rowActionLabel={actionLabel}/>
  </DataComponent></TableRowsContext.Provider>;
}
function Plot({id,title,queryId=LINE_QUERY,rows,sourceRows,spec,height=320,chartOptions}){
  const {visible}=useDataApp();if(!visible(id))return null;
  return <EvidenceChart id={id} queryId={queryId} title={title} variant="card" spec={spec} rows={rows} sourceRows={sourceRows} height={height} chartOptions={chartOptions}/>;
}
function Metric({id,title,value,rows,queryId=LINE_QUERY,description,trend,onOpen}){
  const {visible}=useDataApp();if(!visible(id))return null;
  const card=<MetricCard id={id} title={title} queryId={queryId} value={value} sourceRows={rows} description={description} trendValues={trend}/>;
  if(!onOpen)return card;
  const open=event=>{if(event.target.closest('button,a,input,select,textarea,[role="menu"]'))return;onOpen();};
  const onKey=event=>{if(event.target!==event.currentTarget)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen();}};
  return <div className="wk-metric-drill" tabIndex={0} aria-label={`Open ${title} details`} onClick={open} onKeyDown={onKey}>{card}</div>;
}
function ExportCSV({rows,fields,label='Download CSV',name='Welingkar_analysis'}){
  const tableRows=useContext(TableRowsContext);const selectedRows=tableRows??rows;
  const download=()=>{const content=csvText(selectedRows,fields);const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <Button onClick={download} disabled={!selectedRows.length}>{label}</Button>;
}
function Message({id,children,tone='neutral'}){return <div className={`wk-message wk-message-${tone}`}><RichNarrative id={id} value={children}/></div>;}

function groupKey(row,field){const value=row?.[field];return value==null||value===''?'Unreported':String(value);}
function linesForVouchers(lines,vouchers){const ids=new Set(vouchers.map(v=>v.id));return lines.filter(line=>ids.has(line.voucherId));}
function showRaw(value,kind){
  if(kind==='money')return sourceMoney(typeof value==='number'?value:value==null||value===''?null:Number(value));
  if(kind==='count')return value==null||value===''?'Not recorded':number(value);
  if(Array.isArray(value))return value.length?value.join(', '):'Not recorded';
  if(value==null||value==='')return 'Not recorded';
  return String(value);
}
const LINE_RAW=[['sourceFile','Source workbook'],['sheet','Worksheet'],['sourceRow','Excel row','count'],['unit','Unit'],['postingDate','Posting date'],['voucher','Voucher'],['party','Recorded party'],['partyGSTIN','Counterparty GSTIN'],['bill','Supplier bill'],['billDate','Bill date'],['account','Account head'],['subaccount','Sub-account'],['service','Goods / service'],['department','Department'],['hsn','HSN/SAC'],['taxType','Tax Type'],['rate','GST rate'],['basic','Basic','money'],['cgst','CGST','money'],['sgst','SGST','money'],['igst','IGST','money'],['gst','Total GST','money'],['other','Other amount','money'],['gross','Recorded gross','money'],['tds','Signed TDS','money'],['net','Net on source row','money']];
const rawColumns=[col('sourceFile','Source workbook'),col('sheet','Worksheet'),col('sourceRow','Excel row',number),col('unit','Unit'),col('postingDate','Posting date'),col('voucher','Voucher'),col('party','Party'),col('bill','Supplier bill'),col('billDate','Bill date'),col('account','Account head'),col('subaccount','Sub-account'),col('service','Goods / service'),col('department','Department'),col('hsn','HSN/SAC'),col('taxType','Tax Type'),col('rate','GST rate'),col('basic','Basic',sourceMoney),col('cgst','CGST',sourceMoney),col('sgst','SGST',sourceMoney),col('igst','IGST',sourceMoney),col('gst','Total GST',sourceMoney),col('gross','Recorded gross',sourceMoney),col('tds','Signed TDS',sourceMoney),col('net','Net on source row',sourceMoney)];
function SourceSlice({crumb,title,lines,onBack,onOpenLine}){
  const vouchers=unique(lines,'voucherId');
  return <section className="wk-drill">
    <div className="wk-entity-heading">
      <div className="wk-drill-heading"><p className="wk-drill-kicker">{crumb}</p><h2>{title}</h2></div>
      <div className="wk-drill-actions"><Button onClick={onBack}>Back</Button></div>
    </div>
    <Message id="slice-raw-note">{`**${number(lines.length)} original source ${lines.length===1?'row':'rows'}** across **${number(vouchers)} internal ${vouchers===1?'voucher':'vouchers'}**. Select a row to open every value entered for that Excel row.`}</Message>
    <div className="wk-metrics wk-metrics-three">
      <Metric id="slice-gross" title="Recorded gross" value={compactMoney(sumKnown(lines,'gross'))} rows={lines}/>
      <Metric id="slice-gst" title="Recorded GST" value={compactMoney(sumKnown(lines,'gst'))} rows={lines}/>
      <Metric id="slice-rows" title="Source rows" value={number(lines.length)} rows={lines}/>
    </div>
    <EvidenceTable id="slice-source-rows" title="Original source rows" rows={lines} sourceRows={lines} columns={rawColumns} onSelect={onOpenLine} actionLabel={row=>`Open the entered values for Excel row ${row.sourceRow} on ${row.voucher}`} toolbarControls={<ExportCSV rows={lines} fields={rawColumns} name="Welingkar_source_rows"/>}/>
  </section>;
}
function VoucherDialog({voucherId,lineId,onClose}){
  const {queries}=useDataApp();
  const v=queries[VOUCHER_QUERY].rows.find(r=>r.id===voucherId);
  const lines=v?queries[LINE_QUERY].rows.filter(r=>r.voucherId===v.id):[];
  const [focusId,setFocusId]=useState(lineId);
  useEffect(()=>{setFocusId(lineId||null);},[voucherId,lineId]);
  const focus=lines.find(r=>r.id===focusId)||lines[0];
  return <Dialog open={!!v} onClose={onClose} expanded title={focus?`Excel row ${focus.sourceRow} · ${focus.voucher}`:v?`Voucher ${v.voucher}`:'Source row'}>
    {v&&focus&&<div className="wk-voucher-detail">
      <div className="wk-record-heading"><strong>{focus.party}</strong><span>{focus.unit} · {focus.postingDate} · {focus.sourceFile}</span></div>
      <Message id="voucher-full-scope">{`These are the values entered on **Excel row ${focus.sourceRow}** of **${focus.sheet||'the source worksheet'}** in **${focus.sourceFile}**. The voucher has **${lines.length} original source ${lines.length===1?'row':'rows'}**. ${v.reconStatus==='Review net'?'The voucher net amount requires reconciliation.':v.reconStatus==='Unvalued'?'This voucher has no recorded financial amounts.':'Gross plus signed TDS matches recorded Net within ₹1; this does not establish payment.'}`}</Message>
      <dl className="wk-key-values">{LINE_RAW.map(([field,label,kind])=><div key={field}><dt>{label}</dt><dd>{showRaw(focus[field],kind)}</dd></div>)}</dl>
      <DataComponent id="voucher-modal-description" queryId={LINE_QUERY} title="Narration as entered" kind="custom" sourceRows={lines} variant="card"><div className="wk-narration" data-reviewed-rows>{focus.narration||'Not recorded'}</div><p className="wk-small">Contact and payment identifiers are omitted from narration. The workbook, worksheet and Excel row are retained.</p></DataComponent>
      <dl className="wk-key-values"><div><dt>Check status</dt><dd>{v.reconStatus}</dd></div><div><dt>Net difference</dt><dd>{sourceMoney(v.netDifference)}</dd></div><div><dt>Posting lag (days)</dt><dd>{showRaw(focus.lagDays,'count')}</dd></div><div><dt>Review flags</dt><dd>{focus.flagCodes?.length?focus.flagCodes.join(', '):'None'}</dd></div></dl>
      <EvidenceTable id="voucher-modal-lines" title="Every source row on this voucher" rows={lines} sourceRows={lines} searchable={false} selectedRowKey={focus.id} columns={rawColumns} onSelect={row=>setFocusId(row.id)} actionLabel={row=>`Show the entered values for Excel row ${row.sourceRow}`}/>
      <ExportCSV rows={lines} fields={rawColumns} name={'Welingkar_'+v.voucher.replaceAll('/','_')}/>
    </div>}
  </Dialog>;
}

function DrillPage({id,kicker,title,summary,onBack,children}){
  return <section className="wk-drill">
    <div className="wk-entity-heading">
      <div className="wk-drill-heading">
        <p className="wk-drill-kicker">{kicker}</p>
        <h2>{title}</h2>
      </div>
      <div className="wk-drill-actions"><Button onClick={onBack}>Back to overview</Button></div>
    </div>
    <Message id={id+'-scope'}>{summary}</Message>
    {children}
  </section>;
}
function groupVouchers(rows,field){
  const groups=new Map();
  for(const r of rows){const label=r[field]==null||r[field]===''?'Unreported':String(r[field]);if(!groups.has(label))groups.set(label,[]);groups.get(label).push(r);}
  const total=rows.length,gross=sumKnown(rows,'gross');
  return [...groups].map(([label,items])=>{
    const g=sumKnown(items,'gross');
    const absolute=items.reduce((s,v)=>s+Math.abs(v.netDifference||0),0);
    return {label,vouchers:items.length,gross:g,grossLakh:g==null?null:g/1e5,gst:sumKnown(items,'gst'),net:sumKnown(items,'net'),sharePct:total?items.length/total*100:null,grossSharePct:gross>0?(g??0)/gross*100:null,unvalued:items.filter(v=>!v.hasAmounts).length,exceptions:items.filter(v=>v.reconStatus==='Review net').length,absoluteDifference:items.some(v=>v.netDifference!=null)?absolute:null,absoluteLakh:items.some(v=>v.netDifference!=null)?absolute/1e5:null,netDifference:sumKnown(items,'netDifference')};
  });
}
const monthLabel=iso=>iso&&/^\d{4}-\d{2}/.test(iso)?new Date(iso+'T00:00:00Z').toLocaleDateString('en-IN',{month:'short',year:'numeric',timeZone:'UTC'}):iso||'Unreported';
function voucherMonths(rows){
  return groupVouchers(rows,'month').sort((a,b)=>a.label.localeCompare(b.label)).map(r=>({...r,date:r.label,month:monthLabel(r.label)}));
}
const detailColumns=[col('unit','Unit'),col('postingDate','Posting date'),col('voucher','Voucher'),col('party','Party'),col('account','Account head'),col('subaccount','Sub-account'),col('service','Goods / service'),col('basic','Basic',sourceMoney),col('gst','GST',sourceMoney),col('gross','Recorded gross',sourceMoney),col('sourceFile','Source workbook'),col('sourceRow','Excel row',number)];
const exceptionColumns=[col('unit','Unit'),col('voucher','Voucher'),col('party','Party'),col('postingDate','Posting date'),col('bill','Supplier bill'),col('gross','Gross',sourceMoney),col('tds','Signed TDS',sourceMoney),col('net','Recorded net',sourceMoney),col('netDifference','Net difference',sourceMoney),col('lineCount','Detail rows',number),col('sourceFile','Source workbook'),col('sourceRows','Excel rows',rowsFormat)];
const gstLineColumns=[col('unit','Unit'),col('postingDate','Posting date'),col('voucher','Voucher'),col('party','Party'),col('taxType','Tax Type'),col('hsn','HSN/SAC'),col('rate','Rate'),col('basic','Basic',sourceMoney),col('cgst','CGST',sourceMoney),col('sgst','SGST',sourceMoney),col('igst','IGST',sourceMoney),col('gst','Total GST',sourceMoney),col('gross','Recorded gross',sourceMoney)];

function GrossDrill({m,onOpen,onOpenLine,onBack}){
  const [slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const negatives=m.lines.filter(r=>r.flagCodes.includes('negative_adjustment'));
  const largest=[...m.vouchers].filter(v=>v.gross!=null).sort((a,b)=>b.gross-a.gross).slice(0,15);
  const negativeGross=sumKnown(negatives,'gross');
  if(slice)return <SourceSlice crumb="Overview · Recorded gross" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <DrillPage id="drill-gross" kicker="Overview" title="Recorded gross" onBack={onBack} summary={`**${compactMoney(m.gross)}** is the sum of recorded gross detail in the current unit and posting-date selection, including **${number(negatives.length)} negative adjustments**${negativeGross==null?'':` totalling ${money(negativeGross)}`}. Basic amount plus recorded GST makes up this gross. Select any row to open the original source rows, then a row to see every value entered. It is not a reconciled supplier-bill total or cash paid.`}>
    <div className="wk-metrics">
      <Metric id="drill-gross-total" title="Recorded gross" value={compactMoney(m.gross)} rows={m.lines} trend={m.months.map(r=>r.gross)} description="Sum of recorded gross detail in the current selection."/>
      <Metric id="drill-gross-basic" title="Basic amount" value={compactMoney(m.basic)} rows={m.lines}/>
      <Metric id="drill-gross-gst" title="GST included in gross" value={compactMoney(m.gst)} rows={m.lines}/>
      <Metric id="drill-gross-rows" title="Detail rows" value={number(m.lines.length)} rows={m.lines} description={`${number(m.vouchers.length)} internal vouchers contain these rows.`}/>
    </div>
    <div className="wk-grid-two">
      <Plot id="drill-gross-monthly" title="Monthly recorded gross (₹ lakh)" rows={m.months} sourceRows={m.lines} spec={{type:'bar',x:'date',y:'grossLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.month}`,onSelect:()=>openSlice(row.month,m.lines.filter(line=>line.month===row.date))}]}}/>
      <Plot id="drill-gross-units" title="Recorded gross by unit (₹ lakh)" rows={m.units} sourceRows={m.lines} spec={{type:'horizontalBar',x:'label',y:'grossLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.label}`,onSelect:()=>openSlice(row.label,m.lines.filter(line=>line.unit===row.label))}]}}/>
    </div>
    <EvidenceTable id="drill-gross-month-table" title="Gross by posting month" rows={m.months} sourceRows={m.lines} searchable={false} columns={[col('month','Posting month'),col('rows','Detail rows',number),col('vouchers','Vouchers',number),col('basic','Basic',money),col('gst','GST',money),col('gross','Recorded gross',money),col('sharePct','Gross share',percent)]} onSelect={row=>openSlice(row.month,m.lines.filter(line=>line.month===row.date))} actionLabel={row=>`Open the source rows posted in ${row.month}`}/>
    <EvidenceTable id="drill-gross-unit-table" title="Gross by unit" rows={m.units} sourceRows={m.lines} searchable={false} columns={[col('label','Unit'),col('rows','Detail rows',number),col('vouchers','Vouchers',number),col('parties','Parties',number),col('basic','Basic',money),col('gst','GST',money),col('gross','Recorded gross',money),col('sharePct','Gross share',percent)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>line.unit===row.label))} actionLabel={row=>`Open the source rows for ${row.label}`}/>
    <div className="wk-grid-two">
      <Plot id="drill-gross-services" title="Goods and service classifications (₹ lakh)" rows={m.services} sourceRows={m.lines} spec={{type:'horizontalBar',x:'label',y:'grossLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.label}`,onSelect:()=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'service')===row.label))}]}}/>
      <EvidenceTable id="drill-gross-service-table" title="Gross by goods / service" rows={m.services} sourceRows={m.lines} searchable={false} columns={[col('label','Goods / service'),col('rows','Detail rows',number),col('vouchers','Vouchers',number),col('gross','Recorded gross',money),col('sharePct','Gross share',percent)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'service')===row.label))} actionLabel={row=>`Open the source rows for ${row.label}`}/>
    </div>
    <EvidenceTable id="drill-gross-accounts" title="Gross by account head" rows={m.accounts} sourceRows={m.lines} columns={categoryColumns} toolbarControls={<ExportCSV rows={m.accounts} fields={categoryColumns} name="Welingkar_gross_by_account"/>} onSelect={row=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'account')===row.label))} actionLabel={row=>`Open the source rows for ${row.label}`}/>
    <EvidenceTable id="drill-gross-subaccounts" title="Gross by sub-account" rows={m.subaccounts} sourceRows={m.lines} columns={categoryColumns} toolbarControls={<ExportCSV rows={m.subaccounts} fields={categoryColumns} name="Welingkar_gross_by_subaccount"/>} onSelect={row=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'subaccount')===row.label))} actionLabel={row=>`Open the source rows for ${row.label}`}/>
    <EvidenceTable id="drill-gross-parties" title="Gross by counterparty" rows={m.parties} sourceRows={m.lines} columns={[col('label','Recorded party name'),col('units','Units'),col('vouchers','Vouchers',number),col('rows','Detail rows',number),col('gross','Recorded gross',money),col('sharePct','Gross share',percent)]} toolbarControls={<ExportCSV rows={m.parties} fields={[col('label','Party'),col('units','Units'),col('vouchers','Vouchers'),col('rows','Detail rows'),col('gross','Gross'),col('sharePct','Gross share (%)')]} name="Welingkar_gross_by_party"/>} onSelect={row=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'party')===row.label))} actionLabel={row=>`Open the source rows for ${row.label}`}/>
    <EvidenceTable id="drill-gross-largest" title="Largest vouchers by recorded gross" queryId={VOUCHER_QUERY} rows={largest} sourceRows={largest} columns={[col('unit','Unit'),col('voucher','Voucher'),col('party','Party'),col('postingDate','Posting date'),col('lineCount','Detail rows',number),col('gross','Recorded gross',sourceMoney)]} onSelect={r=>onOpen(r.id)} actionLabel={r=>`Inspect voucher ${r.voucher}`}/>
    <EvidenceTable id="drill-gross-negatives" title="Negative gross adjustments" rows={negatives} sourceRows={negatives} columns={detailColumns} toolbarControls={<ExportCSV rows={negatives} fields={detailColumns} name="Welingkar_negative_adjustments"/>} onSelect={onOpenLine} actionLabel={r=>`Open the entered values for Excel row ${r.sourceRow}`}/>
    <EvidenceTable id="drill-gross-lines" title="Every detail row in recorded gross" rows={m.lines} sourceRows={m.lines} columns={detailColumns} toolbarControls={<ExportCSV rows={m.lines} fields={detailColumns} name="Welingkar_recorded_gross"/>} onSelect={onOpenLine} actionLabel={r=>`Open the entered values for Excel row ${r.sourceRow}`}/>
  </DrillPage>;
}
function VoucherDrill({m,onOpen,onOpenLine,onBack}){
  const [status,setStatus]=useState('all'),[slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const months=voucherMonths(m.vouchers);
  const units=groupVouchers(m.vouchers,'unit').sort((a,b)=>b.vouchers-a.vouchers);
  const statuses=['Matches check','Review net','Unvalued'].map(label=>{const items=m.vouchers.filter(v=>v.reconStatus===label);return {label,vouchers:items.length,gross:sumKnown(items,'gross'),net:sumKnown(items,'net'),sharePct:m.vouchers.length?items.length/m.vouchers.length*100:null};});
  const records=[...m.vouchers].filter(v=>status==='all'||v.reconStatus===status).sort((a,b)=>String(a.unit).localeCompare(String(b.unit))||String(a.postingDate).localeCompare(String(b.postingDate))||String(a.voucher).localeCompare(String(b.voucher)));
  if(slice)return <SourceSlice crumb="Overview · Internal vouchers" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <DrillPage id="drill-vouchers" kicker="Overview" title="Internal vouchers" onBack={onBack} summary={`**${number(m.vouchers.length)} internal vouchers** are in the current selection. **${number(m.monetary.length)}** have recorded amounts and **${number(m.unvalued.length)}** have no financial amounts, so their value stays unknown. Select a group to open its source rows, or a voucher to open every value entered on its Excel rows.`}>
    <div className="wk-metrics">
      <Metric id="drill-voucher-count" queryId={VOUCHER_QUERY} title="Internal vouchers" value={number(m.vouchers.length)} rows={m.vouchers}/>
      <Metric id="drill-voucher-monetary" queryId={VOUCHER_QUERY} title="Monetary vouchers" value={number(m.monetary.length)} rows={m.monetary}/>
      <Metric id="drill-voucher-unvalued" queryId={VOUCHER_QUERY} title="Unvalued vouchers" value={number(m.unvalued.length)} rows={m.unvalued} description="Every financial amount on these vouchers is unreported."/>
      <Metric id="drill-voucher-parties" queryId={VOUCHER_QUERY} title="Recorded party names" value={number(unique(m.vouchers,'party'))} rows={m.vouchers}/>
    </div>
    <div className="wk-grid-two">
      <Plot id="drill-voucher-monthly" queryId={VOUCHER_QUERY} title="Vouchers by posting month" rows={months} sourceRows={m.vouchers} spec={{type:'bar',x:'date',y:'vouchers',startAtZero:true}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.month}`,onSelect:()=>openSlice(row.month,linesForVouchers(m.lines,m.vouchers.filter(v=>v.month===row.date)))}]}}/>
      <Plot id="drill-voucher-units" queryId={VOUCHER_QUERY} title="Vouchers by unit" rows={units} sourceRows={m.vouchers} spec={{type:'horizontalBar',x:'label',y:'vouchers',startAtZero:true}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.label}`,onSelect:()=>openSlice(row.label,m.lines.filter(line=>line.unit===row.label))}]}}/>
    </div>
    <EvidenceTable id="drill-voucher-status" title="Vouchers by check status" queryId={VOUCHER_QUERY} rows={statuses} sourceRows={m.vouchers} searchable={false} columns={[col('label','Check status'),col('vouchers','Vouchers',number),col('sharePct','Share of vouchers',percent),col('gross','Recorded gross',money),col('net','Recorded net',money)]} onSelect={row=>openSlice(row.label,linesForVouchers(m.lines,m.vouchers.filter(v=>v.reconStatus===row.label)))} actionLabel={row=>`Open the source rows with status ${row.label}`}/>
    <EvidenceTable id="drill-voucher-months" title="Vouchers by posting month" queryId={VOUCHER_QUERY} rows={months} sourceRows={m.vouchers} searchable={false} columns={[col('month','Posting month'),col('vouchers','Vouchers',number),col('unvalued','Unvalued',number),col('exceptions','Net exceptions',number),col('gross','Recorded gross',money),col('sharePct','Share of vouchers',percent)]} onSelect={row=>openSlice(row.month,linesForVouchers(m.lines,m.vouchers.filter(v=>v.month===row.date)))} actionLabel={row=>`Open the source rows posted in ${row.month}`}/>
    <EvidenceTable id="drill-voucher-unit-table" title="Vouchers by unit" queryId={VOUCHER_QUERY} rows={units} sourceRows={m.vouchers} searchable={false} columns={[col('label','Unit'),col('vouchers','Vouchers',number),col('unvalued','Unvalued',number),col('exceptions','Net exceptions',number),col('gross','Recorded gross',money),col('sharePct','Share of vouchers',percent)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>line.unit===row.label))} actionLabel={row=>`Open the source rows for ${row.label}`}/>
    <EvidenceTable id="drill-voucher-unvalued-list" title="Vouchers with no recorded amounts" queryId={VOUCHER_QUERY} rows={m.unvalued} sourceRows={m.unvalued} columns={[col('unit','Unit'),col('voucher','Voucher'),col('party','Party'),col('postingDate','Posting date'),col('bill','Supplier bill'),col('lineCount','Detail rows',number),col('sourceFile','Source workbook'),col('sourceRows','Excel rows',rowsFormat)]} onSelect={r=>onOpen(r.id)} actionLabel={r=>`Inspect voucher ${r.voucher}`} toolbarControls={<ExportCSV rows={m.unvalued} fields={voucherColumns} name="Welingkar_unvalued_vouchers"/>}/>
    <EvidenceTable id="drill-voucher-register" title="Internal voucher register" queryId={VOUCHER_QUERY} rows={records} sourceRows={records} columns={voucherColumns} onSelect={r=>onOpen(r.id)} actionLabel={r=>`Inspect voucher ${r.voucher}`}
      toolbarControls={<><Dropdown label="Check status" value={status} choices={['all','Matches check','Review net','Unvalued']} formatChoice={v=>v==='all'?'All vouchers':v} onChange={setStatus} showLabel/><ExportCSV rows={records} fields={voucherColumns} name="Welingkar_internal_vouchers"/></>}/>
  </DrillPage>;
}
function GstDrill({m,onOpenLine,onBack}){
  const [view,setView]=useState('bearing'),[slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const bearing=m.lines.filter(r=>r.gstPresent);
  const missing=m.lines.filter(r=>!r.gstPresent);
  const mismatches=m.lines.filter(r=>r.flagCodes.includes('gst_components')).map(r=>{
    const parts=['cgst','sgst','igst'].map(k=>r[k]).filter(v=>v!=null&&Number.isFinite(v));
    const componentSum=parts.length?parts.reduce((a,b)=>a+b,0):null;
    return {...r,componentSum,componentGap:componentSum==null||r.gst==null?null:componentSum-r.gst};
  });
  const cgst=sumKnown(m.lines,'cgst'),sgst=sumKnown(m.lines,'sgst'),igst=sumKnown(m.lines,'igst');
  const months=m.months.map(r=>({...r,gstLakh:r.gst==null?null:r.gst/1e5}));
  const records=view==='bearing'?bearing:view==='missing'?missing:view==='mismatch'?mismatches:m.lines;
  const viewLabel={bearing:'GST-bearing rows',missing:'Rows without GST',mismatch:'Component mismatches',all:'All detail rows'};
  if(slice)return <SourceSlice crumb="Overview · Recorded GST" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <DrillPage id="drill-gst" kicker="Overview" title="Recorded GST" onBack={onBack} summary={`**${compactMoney(m.gst)}** is recorded Total GST in the current selection. **${number(bearing.length)} rows** carry GST and **${number(missing.length)}** do not. Select a tax type, rate, unit or month to open the source rows, then a row to see every value entered. This is not an input-credit or remittance conclusion.`}>
    <div className="wk-metrics">
      <Metric id="drill-gst-total" title="Recorded GST" value={compactMoney(m.gst)} rows={m.lines} trend={m.months.map(r=>r.gst)}/>
      <Metric id="drill-gst-cgst" title="CGST" value={compactMoney(cgst)} rows={m.lines}/>
      <Metric id="drill-gst-sgst" title="SGST" value={compactMoney(sgst)} rows={m.lines}/>
      <Metric id="drill-gst-igst" title="IGST" value={compactMoney(igst)} rows={m.lines}/>
    </div>
    <div className="wk-metrics wk-metrics-three">
      <Metric id="drill-gst-bearing" title="GST-bearing rows" value={number(bearing.length)} rows={bearing}/>
      <Metric id="drill-gst-missing" title="Rows without GST" value={number(missing.length)} rows={missing}/>
      <Metric id="drill-gst-mismatch" title="Component mismatches" value={number(mismatches.length)} rows={mismatches} description="CGST + SGST + IGST differs from recorded Total GST by more than ₹1."/>
    </div>
    <div className="wk-grid-two">
      <Plot id="drill-gst-monthly" title="Monthly recorded GST (₹ lakh)" rows={months} sourceRows={m.lines} spec={{type:'bar',x:'date',y:'gstLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.month}`,onSelect:()=>openSlice(row.month,m.lines.filter(line=>line.month===row.date))}]}}/>
      <Plot id="drill-gst-units" title="Recorded GST by unit (₹ lakh)" rows={m.units} sourceRows={m.lines} spec={{type:'horizontalBar',x:'label',y:'gstLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.label}`,onSelect:()=>openSlice(row.label,m.lines.filter(line=>line.unit===row.label))}]}}/>
    </div>
    <EvidenceTable id="drill-gst-months" title="GST by posting month" rows={months} sourceRows={m.lines} searchable={false} columns={[col('month','Posting month'),col('rows','Detail rows',number),col('gst','Recorded GST',money),col('gross','Recorded gross',money),col('sharePct','Gross share',percent)]} onSelect={row=>openSlice(row.month,m.lines.filter(line=>line.month===row.date))} actionLabel={row=>`Open the source rows posted in ${row.month}`}/>
    <EvidenceTable id="drill-gst-unit-table" title="GST by unit" rows={m.units} sourceRows={m.lines} searchable={false} columns={[col('label','Unit'),col('rows','Detail rows',number),col('vouchers','Vouchers',number),col('gst','Recorded GST',money),col('gross','Recorded gross',money),col('sharePct','Gross share',percent)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>line.unit===row.label))} actionLabel={row=>`Open the source rows for ${row.label}`}/>
    <div className="wk-grid-two">
      <EvidenceTable id="drill-gst-tax-type" title="Tax Type as recorded" rows={m.tax} sourceRows={m.lines} searchable={false} columns={[col('label','Tax Type'),col('rows','Rows',number),col('vouchers','Vouchers',number),col('gross','Recorded gross',money),col('gst','GST',sourceMoney)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'taxType')===row.label))} actionLabel={row=>`Open the source rows for tax type ${row.label}`}/>
      <EvidenceTable id="drill-gst-rates" title="GST Rate as recorded" rows={m.rates} sourceRows={m.lines} searchable={false} columns={[col('label','Recorded rate'),col('rows','Rows',number),col('basic','Basic',money),col('gst','GST',sourceMoney)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'rate')===row.label))} actionLabel={row=>`Open the source rows recorded at ${row.label}`}/>
    </div>
    <EvidenceTable id="drill-gst-missing-tax" title="Rows without GST, by Tax Type" rows={groupLines(missing,'taxType')} sourceRows={missing} searchable={false} columns={[col('label','Tax Type'),col('rows','Rows',number),col('vouchers','Vouchers',number),col('gross','Recorded gross',money)]} onSelect={row=>openSlice(row.label,missing.filter(line=>groupKey(line,'taxType')===row.label))} actionLabel={row=>`Open the source rows without GST for ${row.label}`}/>
    <EvidenceTable id="drill-gst-components" title="GST component mismatches" rows={mismatches} sourceRows={mismatches} columns={[col('unit','Unit'),col('voucher','Voucher'),col('party','Party'),col('cgst','CGST',sourceMoney),col('sgst','SGST',sourceMoney),col('igst','IGST',sourceMoney),col('componentSum','Component sum',sourceMoney),col('gst','Total GST',sourceMoney),col('componentGap','Component gap',sourceMoney)]} onSelect={onOpenLine} actionLabel={r=>`Open the entered values for Excel row ${r.sourceRow}`}/>
    <EvidenceTable id="drill-gst-lines" title={viewLabel[view]} rows={records} sourceRows={records} columns={gstLineColumns} onSelect={onOpenLine} actionLabel={r=>`Open the entered values for Excel row ${r.sourceRow}`}
      toolbarControls={<><Dropdown label="Rows" value={view} choices={['bearing','missing','mismatch','all']} choiceLabels={viewLabel} onChange={setView} showLabel/><ExportCSV rows={records} fields={gstLineColumns} name="Welingkar_recorded_gst"/></>}/>
  </DrillPage>;
}
function ExceptionDrill({m,onOpen,onOpenLine,onBack}){
  const [slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const ranked=[...m.exceptions].sort((a,b)=>Math.abs(b.netDifference||0)-Math.abs(a.netDifference||0));
  const units=groupVouchers(m.exceptions,'unit').sort((a,b)=>b.vouchers-a.vouchers);
  const months=voucherMonths(m.exceptions);
  const buckets=['Up to ₹100','₹100 to ₹1,000','₹1,000 to ₹10,000','₹10,000 to ₹1 lakh','Above ₹1 lakh'];
  const bucketOf=v=>{const n=Math.abs(v.netDifference||0);if(n<=100)return buckets[0];if(n<=1000)return buckets[1];if(n<=10000)return buckets[2];if(n<=100000)return buckets[3];return buckets[4];};
  const bucketRows=buckets.map(label=>{const items=ranked.filter(v=>bucketOf(v)===label);return {label,vouchers:items.length,absoluteDifference:items.reduce((s,v)=>s+Math.abs(v.netDifference||0),0),netDifference:sumKnown(items,'netDifference'),gross:sumKnown(items,'gross')};});
  const unitCheck=m.units.map(r=>{const h=m.vouchers.filter(v=>v.unit===r.label);const gross=sumKnown(h,'gross'),tds=sumKnown(h,'tds');return {...r,expected:gross==null?null:gross+(tds??0),net:sumKnown(h,'net'),difference:sumKnown(h,'netDifference')};});
  const exceptionLines=unit=>linesForVouchers(m.lines,m.exceptions.filter(v=>v.unit===unit));
  if(slice)return <SourceSlice crumb="Overview · Net exceptions" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <DrillPage id="drill-exceptions" kicker="Overview" title="Net exceptions" onBack={onBack} summary={`**${number(m.exceptions.length)} vouchers** fail the check **recorded Net − (Gross + signed TDS)** by more than ₹1. They are **${percent(m.netExceptionPct)}** of monetary vouchers. Absolute differences total **${compactMoney(m.absoluteDifference)}**. Select a group to open its source rows, or a voucher to open every value entered. These are review candidates, not established loss or overpayment.`}>
    <div className="wk-metrics">
      <Metric id="drill-exception-count" queryId={VOUCHER_QUERY} title="Net exceptions" value={number(m.exceptions.length)} rows={m.exceptions}/>
      <Metric id="drill-exception-share" queryId={VOUCHER_QUERY} title="Share of monetary vouchers" value={percent(m.netExceptionPct)} rows={m.monetary}/>
      <Metric id="drill-exception-absolute" queryId={VOUCHER_QUERY} title="Absolute differences" value={compactMoney(m.absoluteDifference)} rows={m.exceptions} description="Sum of absolute voucher differences. Not loss or overpayment."/>
      <Metric id="drill-exception-signed" queryId={VOUCHER_QUERY} title="Signed difference" value={compactMoney(m.netDifference)} rows={m.exceptions} description="Sum of signed Net differences. Positive and negative gaps offset."/>
    </div>
    <div className="wk-grid-two">
      <Plot id="drill-exception-units" queryId={VOUCHER_QUERY} title="Net exceptions by unit" rows={units} sourceRows={m.exceptions} spec={{type:'horizontalBar',x:'label',y:'vouchers',startAtZero:true}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.label}`,onSelect:()=>openSlice(row.label,exceptionLines(row.label))}]}}/>
      <Plot id="drill-exception-amount" queryId={VOUCHER_QUERY} title="Absolute difference by unit (₹ lakh)" rows={units} sourceRows={m.exceptions} spec={{type:'horizontalBar',x:'label',y:'absoluteLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.label}`,onSelect:()=>openSlice(row.label,exceptionLines(row.label))}]}}/>
    </div>
    <EvidenceTable id="drill-exception-buckets" title="Difference size" queryId={VOUCHER_QUERY} rows={bucketRows} sourceRows={m.exceptions} searchable={false} columns={[col('label','Absolute difference'),col('vouchers','Vouchers',number),col('absoluteDifference','Absolute differences',money),col('netDifference','Signed difference',money),col('gross','Recorded gross',money)]} onSelect={row=>openSlice(row.label,linesForVouchers(m.lines,ranked.filter(v=>bucketOf(v)===row.label)))} actionLabel={row=>`Open the source rows in ${row.label}`}/>
    <EvidenceTable id="drill-exception-units-table" title="Exceptions by unit" queryId={VOUCHER_QUERY} rows={units} sourceRows={m.exceptions} searchable={false} columns={[col('label','Unit'),col('vouchers','Exception vouchers',number),col('absoluteDifference','Absolute differences',money),col('netDifference','Signed difference',money),col('gross','Recorded gross',money)]} onSelect={row=>openSlice(row.label,exceptionLines(row.label))} actionLabel={row=>`Open the exception source rows for ${row.label}`}/>
    <EvidenceTable id="drill-exception-months" title="Exceptions by posting month" queryId={VOUCHER_QUERY} rows={months} sourceRows={m.exceptions} searchable={false} columns={[col('month','Posting month'),col('vouchers','Exception vouchers',number),col('absoluteDifference','Absolute differences',money),col('netDifference','Signed difference',money),col('gross','Recorded gross',money)]} onSelect={row=>openSlice(row.month,linesForVouchers(m.lines,m.exceptions.filter(v=>v.month===row.date)))} actionLabel={row=>`Open the exception source rows posted in ${row.month}`}/>
    <EvidenceTable id="drill-exception-unit-check" title="Unit check: gross + signed TDS against recorded net" queryId={VOUCHER_QUERY} rows={unitCheck} sourceRows={m.vouchers} searchable={false} columns={[col('label','Unit'),col('expected','Gross + signed TDS',sourceMoney),col('net','Recorded net',sourceMoney),col('difference','Signed difference',sourceMoney),col('netExceptions','Exceptions',number),col('unvalued','Unvalued',number)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>line.unit===row.label))} actionLabel={row=>`Open the source rows for ${row.label}`}/>
    <EvidenceTable id="drill-exception-unvalued" title="Unvalued vouchers excluded from the exception count" queryId={VOUCHER_QUERY} rows={m.unvalued} sourceRows={m.unvalued} columns={[col('unit','Unit'),col('voucher','Voucher'),col('party','Party'),col('postingDate','Posting date'),col('lineCount','Detail rows',number),col('sourceFile','Source workbook')]} onSelect={r=>onOpen(r.id)} actionLabel={r=>`Open the entered values on ${r.voucher}`}/>
    <EvidenceTable id="drill-exception-register" title="All net exceptions" queryId={VOUCHER_QUERY} rows={ranked} sourceRows={ranked} columns={exceptionColumns} onSelect={r=>onOpen(r.id)} actionLabel={r=>`Open the entered values on ${r.voucher}`} toolbarControls={<ExportCSV rows={ranked} fields={exceptionColumns} name="Welingkar_net_exceptions"/>}/>
  </DrillPage>;
}
function Overview({m,onOpen,onOpenLine}){
  const [drill,setDrill]=useState(null),[slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const closeDrill=()=>{setDrill(null);window.scrollTo(0,0);};
  if(drill==='gross')return <GrossDrill m={m} onOpen={onOpen} onOpenLine={onOpenLine} onBack={closeDrill}/>;
  if(drill==='vouchers')return <VoucherDrill m={m} onOpen={onOpen} onOpenLine={onOpenLine} onBack={closeDrill}/>;
  if(drill==='gst')return <GstDrill m={m} onOpenLine={onOpenLine} onBack={closeDrill}/>;
  if(drill==='exceptions')return <ExceptionDrill m={m} onOpen={onOpen} onOpenLine={onOpenLine} onBack={closeDrill}/>;
  if(slice)return <SourceSlice crumb="Overview" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <>
    <div className="wk-metrics">
      <Metric id="overview-gross" title="Recorded gross" value={compactMoney(m.gross)} rows={m.lines} trend={m.months.map(r=>r.gross)} description="Sum of recorded gross detail, including negative adjustments. Complete supplier bills are not reconciled." onOpen={()=>{setDrill('gross');window.scrollTo(0,0);}}/>
      <Metric id="overview-vouchers" title="Internal vouchers" value={number(m.vouchers.length)} rows={m.vouchers} queryId={VOUCHER_QUERY} description={`${m.unvalued.length} vouchers have no recorded financial amounts.`} onOpen={()=>{setDrill('vouchers');window.scrollTo(0,0);}}/>
      <Metric id="overview-gst" title="Recorded GST" value={compactMoney(m.gst)} rows={m.lines} trend={m.months.map(r=>r.gst)} description="Recorded Total GST; component-column discrepancies are shown under Tax & TDS." onOpen={()=>{setDrill('gst');window.scrollTo(0,0);}}/>
      <Metric id="overview-exceptions" title="Net exceptions" value={number(m.exceptions.length)} rows={m.vouchers} queryId={VOUCHER_QUERY} description={`${percent(m.netExceptionPct)} of monetary vouchers fail the ₹1 arithmetic check. Not established loss.`} onOpen={()=>{setDrill('exceptions');window.scrollTo(0,0);}}/>
    </div>
    <Message id="overview-qualification" tone="amber">{`Gross represents the exported detail, not reconciled complete bills or cash paid. **${number(m.exceptions.length)} vouchers need net reconciliation**${m.unvalued.length?`; ${number(m.unvalued.length)} other vouchers have unknown value`:' '}.`}</Message>
    <div className="wk-grid-two">
      <Plot id="overview-monthly" title="Monthly recorded gross (₹ lakh)" rows={m.months} sourceRows={m.lines} spec={{type:'bar',x:'date',y:'grossLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.month}`,onSelect:()=>openSlice(row.month,m.lines.filter(line=>line.month===row.date))}]}}/>
      <Plot id="overview-units" title="Recorded gross by unit (₹ lakh)" rows={m.units} sourceRows={m.lines} spec={{type:'horizontalBar',x:'label',y:'grossLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.label}`,onSelect:()=>openSlice(row.label,m.lines.filter(line=>line.unit===row.label))}]}}/>
    </div>
    <EvidenceTable id="overview-unit-scorecard" title="Unit comparison" rows={m.units} sourceRows={m.lines} searchable={false} columns={[col('label','Unit'),col('vouchers','Vouchers',number),col('gross','Recorded gross',money),col('gst','GST',money),col('netExceptions','Net exceptions',number),col('unvalued','Unvalued vouchers',number)]} onSelect={r=>openSlice(r.label,m.lines.filter(line=>line.unit===r.label))} actionLabel={r=>`Open the source rows for ${r.label}`}/>
    <div className="wk-grid-two">
      <EvidenceTable id="overview-categories" title="Largest sub-accounts" rows={m.subaccounts.slice(0,8)} sourceRows={m.lines} columns={[col('label','Sub-account'),col('gross','Recorded gross',money),col('sharePct','Share',percent)]} onSelect={r=>openSlice(r.label,m.lines.filter(line=>groupKey(line,'subaccount')===r.label))} actionLabel={r=>`Open the source rows for ${r.label}`}/>
      <EvidenceTable id="overview-review-queue" title="Largest net differences" queryId={VOUCHER_QUERY} rows={[...m.exceptions].sort((a,b)=>Math.abs(b.netDifference)-Math.abs(a.netDifference)).slice(0,8)} sourceRows={m.exceptions} columns={[col('unit','Unit'),col('voucher','Voucher'),col('party','Party'),col('netDifference','Net difference',money)]} onSelect={r=>onOpen(r.id)} actionLabel={r=>`Open the entered values on ${r.voucher}`}/>
    </div>
  </>;
}

function Spend({m,onOpenLine}){
  const [level,setLevel]=useState('account'),[slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const categories=level==='account'?m.accounts:m.subaccounts;
  const field=level==='account'?'account':'subaccount';
  if(slice)return <SourceSlice crumb="Spend analysis" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <>
    <div className="wk-metrics">
      <Metric id="spend-gross" title="Recorded gross" value={compactMoney(m.gross)} rows={m.lines}/>
      <Metric id="spend-basic" title="Basic amount" value={compactMoney(m.basic)} rows={m.lines}/>
      <Metric id="spend-capital" title="Explicit capital-work heads" value={compactMoney(m.capitalGross)} rows={m.lines} description="Only Capital Work in Progress and Capital WIP source heads. Other assets can be classified elsewhere."/>
      <Metric id="spend-accounts" title="Account heads" value={number(m.accounts.length)} rows={m.lines}/>
    </div>
    <div className="wk-grid-two">
      <Plot id="spend-unit-history" title="Monthly gross by unit (₹ lakh)" rows={m.unitMonths} sourceRows={m.lines} spec={{type:'bar',x:'date',y:'grossLakh',series:'unit',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.unit} · ${monthLabel(row.date)}`,onSelect:()=>openSlice(`${row.unit} · ${monthLabel(row.date)}`,m.lines.filter(line=>line.unit===row.unit&&line.month===row.date))}]}}/>
      <Plot id="spend-services" title="Goods and service classifications (₹ lakh)" rows={m.services} sourceRows={m.lines} spec={{type:'horizontalBar',x:'label',y:'grossLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.label}`,onSelect:()=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'service')===row.label))}]}}/>
    </div>
    <Message id="spend-categories-note">Account and sub-account labels are the original classifications. Similar names have not been merged. Select a category to open the source rows behind it.</Message>
    <EvidenceTable id="spend-category-table" title="Complete category analysis" rows={categories} sourceRows={m.lines} columns={categoryColumns}
      toolbarControls={<><Dropdown label="Classification" value={level} choices={['account','subaccount']} choiceLabels={{account:'Account head',subaccount:'Sub-account'}} onChange={setLevel} showLabel/><ExportCSV rows={categories} fields={categoryColumns} name="Welingkar_category_analysis"/></>}
      onSelect={r=>openSlice(r.label,m.lines.filter(line=>groupKey(line,field)===r.label))} actionLabel={r=>`Open the source rows for ${r.label}`}/>
  </>;
}

function Parties({m,onOpen,onOpenLine}){
  const [selected,setSelected]=useState(null),[slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const partyLines=selected?m.lines.filter(r=>r.party===selected):[];
  const partyVouchers=selected?m.vouchers.filter(v=>v.party===selected):[];
  const history=monthRows(partyLines);
  if(slice)return <SourceSlice crumb="Counterparties" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <>
    <div className="wk-metrics">
      <Metric id="parties-names" title="Recorded party names" value={number(m.parties.length)} rows={m.lines} description="Includes suppliers, individuals, utilities and internal control accounts. Not a verified supplier count."/>
      <Metric id="parties-concentration" title="Top ten share" value={percent(m.top10Share)} rows={m.lines}/>
      <Metric id="parties-shared" title="Names in multiple units" value={number(m.parties.filter(r=>r.units.includes(',')).length)} rows={m.lines}/>
      <Metric id="parties-aliases" title="Same-identifier name groups" value={number(m.aliases.length)} rows={m.lines} description="Names using the same normalized source tax identifier. Do not merge without verification."/>
    </div>
    <EvidenceTable id="parties-portfolio" title="Counterparty portfolio" rows={m.parties} sourceRows={m.lines} columns={[col('label','Recorded party name'),col('units','Units'),col('vouchers','Vouchers',number),col('gross','Recorded gross',money),col('sharePct','Gross share',percent)]}
      toolbarControls={<ExportCSV rows={m.parties} fields={[col('label','Party'),col('units','Units'),col('vouchers','Vouchers'),col('gross','Gross'),col('sharePct','Gross share (%)')]} name="Welingkar_counterparty_analysis"/>} onSelect={r=>setSelected(r.label)} actionLabel={r=>`Open the history and vouchers for ${r.label}`}/>
    {selected&&<section className="wk-entity-panel">
      <div className="wk-entity-heading"><h2>{selected}</h2><Button onClick={()=>setSelected(null)}>Close counterparty</Button></div>
      <div className="wk-metrics wk-metrics-three">
        <Metric id="party-detail-gross" title="Recorded gross" value={compactMoney(sumKnown(partyLines,'gross'))} rows={partyLines}/>
        <Metric id="party-detail-vouchers" title="Vouchers in scope" value={number(partyVouchers.length)} rows={partyVouchers} queryId={VOUCHER_QUERY}/>
        <Metric id="party-detail-gst" title="Recorded GST" value={compactMoney(sumKnown(partyLines,'gst'))} rows={partyLines}/>
      </div>
      {!partyLines.length?<Message id="party-detail-empty">This counterparty has no records in the current unit and date selection.</Message>:<>
        <Plot id="party-detail-history" title="Counterparty monthly gross (₹ lakh)" rows={history} sourceRows={partyLines} spec={{type:'bar',x:'date',y:'grossLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.month}`,onSelect:()=>openSlice(`${selected} · ${row.month}`,partyLines.filter(line=>line.month===row.date))}]}}/>
        <EvidenceTable id="party-detail-voucher-list" title="Counterparty vouchers" queryId={VOUCHER_QUERY} rows={partyVouchers} sourceRows={partyVouchers} columns={voucherColumns} onSelect={r=>onOpen(r.id)} actionLabel={r=>`Open the entered values on ${r.voucher}`}/>
      </>}
    </section>}
    <div className="wk-grid-two">
      <EvidenceTable id="parties-identity-review" title="Same-identifier name conflicts" rows={m.aliases} sourceRows={m.lines} columns={[col('names','Recorded names'),col('finding','Review note')]} onSelect={r=>openSlice(r.names,m.lines.filter(line=>line.partyTaxKey===r.id))} actionLabel={r=>`Open the source rows recorded under ${r.names}`}/>
      <EvidenceTable id="parties-repeated-bills" title="Repeated bill references" queryId={VOUCHER_QUERY} rows={m.repeats} sourceRows={m.vouchers} columns={[col('unit','Unit'),col('party','Party'),col('bill','Bill reference'),col('billDate','Bill date'),col('vouchers','Vouchers',number),col('sameGross','Same gross?')]} onSelect={r=>openSlice(r.bill,linesForVouchers(m.lines,m.vouchers.filter(v=>r.voucherIds.includes(v.id))))} actionLabel={r=>`Open the source rows for bill ${r.bill}`}/>
    </div>
  </>;
}

function Tax({m,onOpenLine}){
  const [issue,setIssue]=useState('all'),[slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const taxOptions=['all','gst_components','hsn_missing','gst_without_gstin','tax_label_review','taxable_no_gst','rate_40'];
  const records=issue==='all'?m.lines.filter(r=>r.gstPresent):filterIssue(m.lines,issue,m.vouchers);
  const taxMonths=m.months.map(r=>({...r,gstLakh:r.gst==null?null:r.gst/1e5}));
  const tdsMonths=groupLines(m.vouchers,'month').map(r=>({date:r.label,tdsLakh:null}));
  for(const r of tdsMonths){const vals=m.vouchers.filter(v=>v.month===r.date);const amount=sumKnown(vals,'tds');r.tdsLakh=amount==null?null:-amount/1e5;}
  tdsMonths.sort((a,b)=>a.date.localeCompare(b.date));
  if(slice)return <SourceSlice crumb="Tax & TDS" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <>
    <div className="wk-metrics">
      <Metric id="tax-total-gst" title="Recorded GST" value={compactMoney(m.gst)} rows={m.lines}/>
      <Metric id="tax-withholding" title="Recorded TDS withheld" value={compactMoney(m.tds==null?null:-m.tds)} rows={m.vouchers} queryId={VOUCHER_QUERY} description="Magnitude of negative signed TDS amounts. No remittance or legal-rate conclusion."/>
      <Metric id="tax-gst-lines" title="GST-bearing rows" value={number(m.lines.filter(r=>r.gstPresent).length)} rows={m.lines}/>
      <Metric id="tax-component-errors" title="Component mismatches" value={number(m.lines.filter(r=>r.flagCodes.includes('gst_components')).length)} rows={m.lines}/>
    </div>
    <Message id="tax-semantics" tone="amber">Tax Type is an unconfirmed ERP classification. “Exempted” can coexist with supplier GST. These views support recorded-value analysis and exception review; input-credit eligibility, legal rates and remittance need the original evidence.</Message>
    <div className="wk-grid-two">
      <Plot id="tax-gst-history" title="Monthly recorded GST (₹ lakh)" rows={taxMonths} sourceRows={m.lines} spec={{type:'bar',x:'date',y:'gstLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.month}`,onSelect:()=>openSlice(row.month,m.lines.filter(line=>line.month===row.date))}]}}/>
      <Plot id="tax-tds-history" title="Monthly recorded withholding (₹ lakh)" queryId={VOUCHER_QUERY} rows={tdsMonths} sourceRows={m.vouchers} spec={{type:'bar',x:'date',y:'tdsLakh',startAtZero:true,valueDecimals:2}} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${monthLabel(row.date)}`,onSelect:()=>openSlice(monthLabel(row.date),linesForVouchers(m.lines,m.vouchers.filter(v=>v.month===row.date)))}]}}/>
    </div>
    <div className="wk-grid-two">
      <EvidenceTable id="tax-type-schedule" title="Tax Type as recorded" rows={m.tax} sourceRows={m.lines} searchable={false} columns={[col('label','Tax Type'),col('rows','Rows',number),col('gross','Recorded gross',money),col('gst','GST',sourceMoney)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'taxType')===row.label))} actionLabel={row=>`Open the source rows for tax type ${row.label}`}/>
      <EvidenceTable id="tax-rate-schedule" title="GST Rate as recorded" rows={m.rates} sourceRows={m.lines} searchable={false} columns={[col('label','Recorded rate'),col('rows','Rows',number),col('basic','Basic',money),col('gst','GST',sourceMoney)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>groupKey(line,'rate')===row.label))} actionLabel={row=>`Open the source rows recorded at ${row.label}`}/>
    </div>
    <EvidenceTable id="tax-review-lines" title="Tax detail and review records" rows={records} sourceRows={records} columns={[col('unit','Unit'),col('voucher','Voucher'),col('party','Party'),col('partyGSTIN','GSTIN (masked)'),col('taxType','Tax Type'),col('hsn','HSN/SAC'),col('rate','Rate'),col('cgst','CGST',sourceMoney),col('sgst','SGST',sourceMoney),col('igst','IGST',sourceMoney),col('gst','Total GST',sourceMoney)]}
      toolbarControls={<><Dropdown label="Rows" value={issue} choices={taxOptions} formatChoice={v=>v==='all'?'All GST-bearing rows':ISSUE_LABELS[v]} onChange={setIssue} showLabel/><ExportCSV rows={records} fields={lineColumns} name="Welingkar_tax_review"/></>}
      onSelect={onOpenLine} actionLabel={r=>`Open the entered values for Excel row ${r.sourceRow}`}/>
  </>;
}

function Reconciliation({m,onOpen,onOpenLine}){
  const [status,setStatus]=useState('Review net'),[slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const records=[...m.vouchers].filter(v=>status==='all'||v.reconStatus===status).sort((a,b)=>Math.abs(b.netDifference||0)-Math.abs(a.netDifference||0));
  const unitRows=m.units.map(r=>{const h=m.vouchers.filter(v=>v.unit===r.label);const gross=sumKnown(h,'gross'),tds=sumKnown(h,'tds');return {...r,expected:gross==null?null:gross+(tds??0),net:sumKnown(h,'net'),difference:sumKnown(h,'netDifference')};});
  if(slice)return <SourceSlice crumb="Reconciliation" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <>
    <div className="wk-metrics">
      <Metric id="recon-exception-count" queryId={VOUCHER_QUERY} title="Net exceptions" value={number(m.exceptions.length)} rows={m.vouchers}/>
      <Metric id="recon-exception-rate" queryId={VOUCHER_QUERY} title="Share of monetary vouchers" value={percent(m.netExceptionPct)} rows={m.vouchers}/>
      <Metric id="recon-absolute-difference" queryId={VOUCHER_QUERY} title="Absolute differences" value={compactMoney(m.absoluteDifference)} rows={m.exceptions} description="Sum of absolute voucher differences. Not loss or overpayment."/>
      <Metric id="recon-unvalued-count" queryId={VOUCHER_QUERY} title="Unvalued vouchers" value={number(m.unvalued.length)} rows={m.vouchers}/>
    </div>
    <Message id="reconciliation-definition" tone="amber">The check is **recorded Net − (sum of Gross + signed TDS)**, with a ₹1 tolerance. Differences can reflect incomplete exported lines or header/detail scope. Unknown-value vouchers are kept separate. Matching the check does not establish payment.</Message>
    <EvidenceTable id="recon-unit-summary" title="Unit-level reconciliation" queryId={VOUCHER_QUERY} rows={unitRows} sourceRows={m.vouchers} searchable={false} columns={[col('label','Unit'),col('expected','Gross + signed TDS',sourceMoney),col('net','Recorded net',sourceMoney),col('difference','Signed difference',sourceMoney),col('netExceptions','Exceptions',number),col('unvalued','Unvalued',number)]} onSelect={row=>openSlice(row.label,m.lines.filter(line=>line.unit===row.label))} actionLabel={row=>`Open the source rows for ${row.label}`}/>
    <EvidenceTable id="recon-voucher-queue" title="Voucher reconciliation queue" queryId={VOUCHER_QUERY} rows={records} sourceRows={records} columns={voucherColumns}
      toolbarControls={<><Dropdown label="Check status" value={status} choices={['all','Review net','Matches check','Unvalued']} formatChoice={v=>v==='all'?'All vouchers':v} onChange={setStatus} showLabel/><ExportCSV rows={records} fields={voucherColumns} name="Welingkar_voucher_reconciliation"/></>}
      onSelect={r=>onOpen(r.id)} actionLabel={r=>`Open the entered values on ${r.voucher}`}/>
  </>;
}

function Quality({m,onOpenLine}){
  const [issue,setIssue]=useState('net_mismatch'),[slice,setSlice]=useState(null);
  const openSlice=(title,rows)=>{setSlice({title,rows});window.scrollTo(0,0);};
  const selected=m.quality.find(q=>q.code===issue),records=filterIssue(m.lines,issue,m.vouchers);
  const missingness=m.quality.filter(q=>['department_missing','hsn_missing','gstin_missing','bill_date_missing'].includes(q.code)).map(q=>({label:q.label,code:q.code,'Missing (%)':q.ratePct}));
  if(slice)return <SourceSlice crumb="Data quality" title={slice.title} lines={slice.rows} onBack={()=>setSlice(null)} onOpenLine={onOpenLine}/>;
  return <>
    <div className="wk-metrics">
      {['unvalued_voucher','hsn_missing','department_missing','old_bill_year'].map(code=>{const q=m.quality.find(x=>x.code===code);return <Metric key={code} id={'quality-'+code} title={q.label} value={number(q.count)} rows={q.grain==='Vouchers'?m.vouchers:m.lines} queryId={q.grain==='Vouchers'?VOUCHER_QUERY:LINE_QUERY} description={`${q.grain}; ${percent(q.ratePct)} of the applicable current population.`}/>;})}
    </div>
    <Message id="quality-overlap">Findings overlap and use different grains. Do not add their counts to calculate defective transactions or financial loss. Selecting a finding opens its supporting original rows.</Message>
    <Plot id="quality-missingness-chart" title="Missing-field rates in the selected scope" rows={missingness} sourceRows={m.lines} spec={{type:'horizontalBar',x:'label',y:'Missing (%)',startAtZero:true,valueDecimals:1}} height={300} chartOptions={{getMarkActions:({row})=>[{label:`Open source rows for ${row.label}`,onSelect:()=>openSlice(row.label,filterIssue(m.lines,row.code,m.vouchers))}]}}/>
    <EvidenceTable id="quality-findings-table" title="Data-quality findings" rows={m.quality} sourceRows={m.lines} columns={[col('severity','Priority'),col('label','Finding'),col('grain','Counting grain'),col('count','Count',number),col('population','Denominator',number),col('ratePct','Rate',percent),col('detail','Interpretation')]} onSelect={r=>openSlice(r.label,filterIssue(m.lines,r.code,m.vouchers))} actionLabel={r=>`Open the source rows for ${r.label}`}/>
    <EvidenceTable id="quality-source-rows" title={selected?'Supporting rows: '+selected.label:'Supporting rows'} rows={records} sourceRows={records} columns={lineColumns}
      toolbarControls={<><Dropdown label="Finding" value={issue} choices={ISSUE_DEFS.map(x=>x.code)} choiceLabels={ISSUE_LABELS} onChange={setIssue} showLabel/><ExportCSV rows={records} fields={lineColumns} name={'Welingkar_'+issue}/></>}
      onSelect={onOpenLine} actionLabel={r=>`Open the entered values for Excel row ${r.sourceRow}`}/>
  </>;
}

function Transactions({m,onOpen,onOpenLine}){
  const [grain,setGrain]=useState('lines'),[issue,setIssue]=useState('all');
  const lines=filterIssue(m.lines,issue,m.vouchers),ids=new Set(lines.map(r=>r.voucherId));
  const headers=m.vouchers.filter(v=>ids.has(v.id));
  const rows=grain==='lines'?lines:headers;
  const fields=grain==='lines'?[...lineColumns,col('basic','Basic'),col('tds','Signed TDS'),col('net','Net on source row'),col('service','Goods / service'),col('taxType','Tax Type'),col('hsn','HSN/SAC'),col('rate','GST rate'),col('bill','Bill reference'),col('billDate','Bill date'),col('department','Department'),col('partyGSTIN','GSTIN (masked)'),col('narration','Narration (identifiers omitted)'),col('sourceFile','Source workbook'),col('flagCodes','Review flags')]:voucherColumns;
  return <>
    <div className="wk-metrics wk-metrics-three">
      <Metric id="transaction-row-count" title="Original detail rows" value={number(m.lines.length)} rows={m.lines}/>
      <Metric id="transaction-voucher-count" title="Distinct internal vouchers" value={number(m.vouchers.length)} rows={m.vouchers} queryId={VOUCHER_QUERY}/>
      <Metric id="transaction-unknown-rows" title="Rows without amounts" value={number(m.lines.filter(r=>!r.hasAmounts).length)} rows={m.lines}/>
    </div>
    <Message id="transaction-grain">Detail rows and internal vouchers are different grains. Select a detail row to open the values entered on that Excel row, or a voucher to open every source row on it.</Message>
    <EvidenceTable id="transaction-register" title={grain==='lines'?'Original detail register':'Internal voucher register'} queryId={grain==='lines'?LINE_QUERY:VOUCHER_QUERY} rows={rows} sourceRows={rows} columns={grain==='lines'?lineColumns:voucherColumns}
      toolbarControls={<><Dropdown label="Record grain" value={grain} choices={['lines','vouchers']} choiceLabels={{lines:'Detail rows',vouchers:'Internal vouchers'}} onChange={setGrain} showLabel/><Dropdown label="Row review flag" value={issue} choices={['all',...ISSUE_DEFS.map(x=>x.code)]} formatChoice={v=>v==='all'?'All rows':ISSUE_LABELS[v]} onChange={setIssue} showLabel/><ExportCSV rows={rows} fields={fields} name={'Welingkar_'+grain}/></>}
      onSelect={r=>grain==='lines'?onOpenLine(r):onOpen(r.id)} actionLabel={r=>grain==='lines'?`Open the entered values for Excel row ${r.sourceRow}`:`Open the entered values on ${r.voucher}`}/>
  </>;
}

export function DashboardContent(){
  const shell=useDataApp();
  const {snapshot,queries,filters,setFilter,reviewedRows}=shell;
  const {activeTabId}=useDashboardTabs(TABS);
  const tab=TABS.some(t=>t.id===activeTabId)?activeTabId:'overview';
  const selectedTab=TABS.find(t=>t.id===tab);
  const [opened,setOpened]=useState(null);
  const openVoucher=id=>setOpened(id?{voucherId:id,lineId:null}:null);
  const openLine=line=>line&&setOpened({voucherId:line.voucherId,lineId:line.id});
  const lines=reviewedRows(LINE_QUERY,['date','unit','service','account']);
  const headers=reviewedRows(VOUCHER_QUERY,['date','unit']);
  const m=useMemo(()=>buildModel(lines,headers),[lines,headers]);
  const reportHref=typeof location!=='undefined'&&/\.chatgpt(?:-team)?\.site$/.test(location.hostname)?snapshot.portal.reportLibraryURL:snapshot.portal.localReportPath;
  return <div className="wk-portal">
    {tab!=='report'&&<h1 className="wk-sr-only">Welingkar purchase analysis</h1>}
    {selectedTab.filterIds.length>0&&<Filters sticky filters={snapshot.filters.filter(f=>selectedTab.filterIds.includes(f.id))} queries={queries} values={filters} onChange={setFilter} clearLabel="Reset view" ariaLabel={selectedTab.label+' filters'}/>}
    {tab!=='report'&&!m.lines.length&&<Message id={'empty-'+tab}>No source records match this selection. Clear a filter or reset the view. Unreported amounts are not converted to zero.</Message>}
    {tab==='overview'&&<Overview m={m} onOpen={openVoucher} onOpenLine={openLine}/>}
    {tab==='spend'&&<Spend m={m} onOpenLine={openLine}/>}
    {tab==='parties'&&<Parties m={m} onOpen={openVoucher} onOpenLine={openLine}/>}
    {tab==='tax'&&<Tax m={m} onOpenLine={openLine}/>}
    {tab==='reconciliation'&&<Reconciliation m={m} onOpen={openVoucher} onOpenLine={openLine}/>}
    {tab==='quality'&&<Quality m={m} onOpenLine={openLine}/>}
    {tab==='transactions'&&<Transactions m={m} onOpen={openVoucher} onOpenLine={openLine}/>}
    {tab==='report'&&<>
      <div className="wk-report-actions"><span>Full original analysis · April–September 2026</span><a className="wk-download-link" href={reportHref} target="_blank" rel="noreferrer">Download the 68-page PDF</a></div>
      <div className="report-page wk-full-report"><ReportContent/></div>
    </>}
    <footer className="wk-footer"><span>Four uploaded purchase registers · fixed April–September 2026 snapshot</span><a className="wk-download-link" href="/intake">Vendor documents</a></footer>
    <VoucherDialog voucherId={opened?.voucherId??null} lineId={opened?.lineId??null} onClose={()=>setOpened(null)}/>
  </div>;
}
