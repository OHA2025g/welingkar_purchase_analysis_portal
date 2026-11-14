import React from 'react';
import { DataComponent, DataTable, EvidenceChart, ReportSection, RichNarrative, useDataApp } from '../../data-app-public.jsx';
import { ReportDisclosure } from '../shared/ReportDisclosure.jsx';
import { sections } from './sections.js';

const money = n => n == null ? 'Unavailable' : new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const count = n => n == null ? '—' : n.toLocaleString('en-IN');
const pct = n => n == null ? '—' : `${n.toFixed(1)}%`;
const col = (field,label,format) => ({field,label,...(format?{renderCell:v => format(v)}:{})});
const loc = v => Array.isArray(v)?v.join(', '):v;

function Narrative({id,queryIds=['registers'],value}) {
  const {reviewedRows,visible}=useDataApp();
  if(!visible(id))return null;
  const scopes=Object.fromEntries(queryIds.map(q=>[q,reviewedRows(q)]));
  return <ReportSection id={id} title={value.split('\n')[0].replace(/^#+ /,'')} queryId={queryIds[0]} queryIds={queryIds}
    sourceRowsByQuery={scopes} showHeading={false}><RichNarrative id={`${id}:body`} value={value}/></ReportSection>;
}
function Table({id,queryId,title,columns,limit,searchable=true,rows:given}) {
  const {reviewedRows,visible}=useDataApp();
  if(!visible(id))return null;
  const original=reviewedRows(queryId);
  const rows=given ?? (limit?original.slice(0,limit):original);
  return <DataComponent id={id} title={title} queryId={queryId} kind="table" sourceRows={given?original:rows} displayRows={rows}>
    <DataTable rows={rows} columns={columns} searchable={searchable} compactNumbers={false} label={title}/>
  </DataComponent>;
}
function Plot({id,queryId,title,spec,height=340}) {
  const {reviewedRows,visible}=useDataApp();
  if(!visible(id))return null;
  const rows=reviewedRows(queryId);
  return <EvidenceChart id={id} queryId={queryId} title={title} rows={rows} sourceRows={rows} spec={spec} height={height}/>;
}
const accountCols=[col('label','Recorded account head'),col('vouchers','Vouchers',count),col('gross','Gross (INR)',money),col('sharePct','Share',pct)];
const partyCols=[col('label','Recorded party name'),col('vouchers','Vouchers',count),col('units','Units'),col('gross','Gross (INR)',money),col('sharePct','Share',pct)];
const exceptionCols=[col('unit','Unit'),col('voucher','Internal voucher'),col('gross','Gross',money),col('tds','Signed TDS',money),col('net','Recorded net',money),col('net_difference','Difference',money),col('source_rows','Excel rows',loc)];

export function ReportContent(){
  const {snapshot,reviewedRows,appTitle,setAppTitle,canEdit,mode}=useDataApp();
  const t=snapshot.analysis.totals;
  const totalRow={unit:'Combined recorded total',basic:t.basic,gst:t.gst,gross:t.gross,tds:t.tds,net:t.net,sharePct:100};
  const reconTotal={unit:'Combined recorded total',grossLessTds:t.gross+t.tds,net:t.net,netDifference:t.net-t.gross-t.tds,netExceptions:212};
  const content = id => <Narrative key={id} id={id} queryIds={sections[id].queries} value={sections[id].text}/>;
  return <article className="report-content register-report" aria-label="Detailed analysis of the four Welingkar purchase registers">
    <header className="report-hero">
      <h1 data-data-app-title contentEditable={canEdit&&mode==='edit'} suppressContentEditableWarning onBlur={canEdit&&mode==='edit'?e=>setAppTitle(e.currentTarget.textContent.trim()||appTitle):undefined}>{appTitle}</h1>
      <RichNarrative id="report-period" value="**April–September 2026** · Autonomous, Bengaluru, PGDM and University units" className="report-deck"/>
    </header>
    {content('executive-summary')}
    <section className="report-section">
      {content('data-nature')}
      <Table id="data-family-table" queryId="data_families" title="The seven data families" searchable={false} columns={[
        col('family','Data family'),col('fields','What is recorded'),col('use','Typical use')
      ]}/>
    </section>
    <section className="report-section">
      {content('workbook-structure')}
      <Table id="file-coverage" queryId="registers" title="Workbook coverage" searchable={false} columns={[
        col('unit','Unit'),col('data_rows','Detail rows',count),col('vouchers','Vouchers',count),col('parties','Party names',count),col('date_min','First posting'),col('date_max','Last posting')
      ]}/>
    </section>
    <section className="report-section">
      {content('financial-summary')}
      <Table id="financial-table" queryId="registers" rows={[...reviewedRows('registers'),totalRow]} title="Recorded values by unit (INR)" searchable={false} columns={[
        col('unit','Unit'),col('basic','Basic',money),col('gst','Total GST',money),col('gross','Gross',money),col('sharePct','Gross share',pct)
      ]}/>
      <Plot id="unit-gross-chart" queryId="registers" title="PGDM and Bengaluru lead recorded gross value (₹ lakh)" spec={{type:'horizontalBar',x:'unit',y:'grossLakh',startAtZero:true,valueDecimals:2}} height={300}/>
    </section>
    <section className="report-section">
      {content('monthly-patterns')}
      <Plot id="monthly-gross-chart" queryId="monthly" title="Recorded gross by posting month (₹ lakh)" spec={{type:'bar',x:'label',y:'grossLakh',startAtZero:true,valueDecimals:2}}/>
      <Table id="monthly-values" queryId="monthly" title="Monthly values and voucher volumes" searchable={false} columns={[
        col('label','Posting month'),col('rows','Rows',count),col('vouchers','Vouchers',count),col('gross','Gross (INR)',money),col('momPct','Change vs prior month',pct)
      ]}/>
    </section>
    {content('unit-insights')}
    <section className="report-section">
      {content('account-classifications')}
      <Table id="top-accounts" queryId="accounts" title="Largest source account heads" columns={accountCols} limit={15}/>
      <Table id="top-subaccounts" queryId="subaccounts" title="Largest source sub-account heads" columns={[col('label','Sub Account Head'),col('gross','Gross (INR)',money),col('sharePct','Gross share',pct)]} limit={15}/>
    </section>
    <section className="report-section">
      {content('counterparty-analysis')}
      <Table id="largest-parties" queryId="parties" title="Largest recorded party-name totals" columns={partyCols} limit={15}/>
      <Table id="bill-reference-review" queryId="repeated_bills" title="Repeated bill references requiring context" columns={[
        col('unit','Unit'),col('party','Party'),col('bill','Bill reference'),col('bill_date','Bill date'),col('vouchers','Vouchers',count),col('gross_total','Combined gross',money)
      ]}/>
    </section>
    <section className="report-section">
      {content('goods-services-tax')}
      <Table id="source-tax-types" queryId="tax" title="Tax labels and recorded GST (INR)" searchable={false} columns={[
        col('label','Tax Type'),col('rows','Rows',count),col('gross','Gross',money),col('gst','Recorded GST',money)
      ]}/>
      <Table id="source-gst-rates" queryId="rates" title="GST Rate field as supplied" searchable={false} columns={[
        col('label','Rate / blank'),col('rows','Rows',count),col('basic','Basic',money),col('gst','GST',money),col('gross','Gross',money)
      ]}/>
    </section>
    <section className="report-section">
      {content('net-reconciliation')}
      <Table id="reconciliation-summary" queryId="reconciliation" rows={[...reviewedRows('reconciliation'),reconTotal]} title="Net reconciliation by unit (INR)" searchable={false} columns={[
        col('unit','Unit'),col('grossLessTds','Gross + signed TDS',money),col('net','Recorded Net',money),col('netDifference','Difference',money),col('netExceptions','Exceptions',count)
      ]}/>
      <Table id="largest-net-exceptions" queryId="net_exceptions" title="Largest voucher reconciliation differences" limit={8} columns={exceptionCols}/>
    </section>
    <section className="report-section">
      {content('date-quality')}
      <Table id="booking-lag-table" queryId="lag" title="Bill-to-posting lag, including source-date issues" searchable={false} columns={[
        col('label','Lag bucket'),col('vouchers','Vouchers',count),col('gross','Recorded gross',money)
      ]}/>
    </section>
    <section className="report-section">
      {content('quality-assessment')}
      <Table id="quality-register" queryId="quality" title="Prioritised quality findings" columns={[
        col('severity','Priority'),col('finding','Finding'),col('count','Count',count),col('evidence','Evidence / impact'),col('action','Recommended action')
      ]}/>
    </section>
    <section className="report-section">
      {content('available-analytics')}
      <Table id="analytics-feasibility-table" queryId="feasibility" title="Available analyses and missing evidence" columns={[
        col('analysis','Analysis'),col('feasibility','Current feasibility'),col('missing','Qualification / missing evidence')
      ]}/>
    </section>
    {content('recommended-next-steps')}
    <section className="report-section">
      {content('field-dictionary')}
      <Table id="complete-field-dictionary" queryId="dictionary" title="All source columns, population and meaning" columns={[
        col('column','Excel'),col('field','Field'),col('populated','Populated',count),col('coveragePct','Filled',pct),col('meaning','Meaning and limitations')
      ]}/>
    </section>
    <section className="report-section">
      {content('appendices-intro')}
      <DataComponent id="detailed-schedules" title="Detailed schedules" queryId="accounts" kind="custom" sourceRows={reviewedRows('accounts')}>
        <ReportDisclosure id="all-account-heads" label="All 90 account heads"><Table id="full-account-table" queryId="accounts" title="Complete account-head totals" columns={accountCols}/></ReportDisclosure>
        <ReportDisclosure id="all-subaccount-heads" label="All 269 sub-account heads"><Table id="full-subaccount-table" queryId="subaccounts" title="Complete sub-account totals" columns={[col('label','Sub Account Head'),...accountCols.slice(1)]}/></ReportDisclosure>
        <ReportDisclosure id="all-recorded-parties" label="All 460 recorded party names"><Table id="full-party-table" queryId="parties" title="Complete recorded party-name totals" columns={partyCols}/></ReportDisclosure>
        <ReportDisclosure id="all-reconciliation-exceptions" label="All 212 net reconciliation exceptions"><Table id="full-net-exception-table" queryId="net_exceptions" title="Complete net reconciliation review list" columns={exceptionCols}/></ReportDisclosure>
        <ReportDisclosure id="all-largest-vouchers" label="Thirty largest recorded vouchers"><Table id="large-voucher-table" queryId="largest_vouchers" title="Largest vouchers by recorded gross" columns={[
          col('unit','Unit'),col('voucher','Voucher'),col('party','Party'),col('gross','Gross',money),col('source_rows','Excel rows',loc)
        ]}/></ReportDisclosure>
        <ReportDisclosure id="all-unit-months" label="Each unit by month"><Table id="unit-month-table" queryId="unit_month" title="Monthly recorded gross for each unit" columns={[
          col('unit','Unit'),col('month','Month'),col('vouchers','Vouchers',count),col('gross','Gross',money)
        ]}/></ReportDisclosure>
        <ReportDisclosure id="all-unit-account-totals" label="Top account heads within each unit"><Table id="unit-account-table" queryId="unit_accounts" title="Top twelve account heads per unit" columns={[
          col('unit','Unit'),col('account','Account Head'),col('vouchers','Vouchers',count),col('gross','Gross',money)
        ]}/></ReportDisclosure>
        <ReportDisclosure id="all-unit-party-totals" label="Top parties within each unit"><Table id="unit-party-table" queryId="unit_parties" title="Top ten parties per unit" columns={[
          col('unit','Unit'),col('party','Party'),col('vouchers','Vouchers',count),col('gross','Gross',money)
        ]}/></ReportDisclosure>
        <ReportDisclosure id="all-party-name-conflicts" label="Same-tax-identifier name conflicts"><Table id="party-alias-table" queryId="party_aliases" title="Name aliases and conflicts to review" columns={[
          col('names','Names recorded against one identifier'),col('finding','Interpretation')
        ]}/></ReportDisclosure>
      </DataComponent>
    </section>
    {content('source-notes')}
  </article>;
}

