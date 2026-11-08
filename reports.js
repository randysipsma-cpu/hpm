'use strict';
window.HPMReports={
 mount({data,save,eur}){
  const root=document.getElementById('view');
  const records=[...data.sales.map(x=>({...x,kind:'sale'})),...data.purchases.map(x=>({...x,kind:'purchase'}))];
  const years=[...new Set(records.map(x=>String(x.date||'').slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort().reverse();
  const year=window.hpmReportYear&&years.includes(window.hpmReportYear)?window.hpmReportYear:(years[0]||String(new Date().getFullYear()));
  const quarter=window.hpmReportQuarter||1;
  const sum=(a,k)=>Math.round(a.reduce((n,x)=>n+(Number(x[k])||0),0)*100)/100;
  const byYear=records.filter(x=>String(x.date||'').startsWith(year+'-'));
  const sales=byYear.filter(x=>x.kind==='sale'),purchases=byYear.filter(x=>x.kind==='purchase');
  const qRecords=byYear.filter(x=>{const m=Number(String(x.date||'').slice(5,7));return m>=(quarter-1)*3+1&&m<=quarter*3});
  data.vatReviews=data.vatReviews||{};
  root.innerHTML='<div class="card"><h2>Jaaroverzicht en btw-controle</h2><label>Boekjaar<select id="hpm-report-year">'+(years.length?years:[year]).map(y=>'<option '+(y===year?'selected':'')+'>'+y+'</option>').join('')+'</select></label><div id="hpm-year-summary"></div><p class="notice">Dit is een administratief overzicht. Het verschil tussen omzet en inkopen is geen fiscale winst: onder andere voorraad, privégebruik, investeringen en afschrijvingen kunnen correcties vereisen.</p></div><div class="card"><h2>Btw-controle</h2><label>Kwartaal<select id="hpm-report-quarter">'+[1,2,3,4].map(q=>'<option value="'+q+'" '+(q===quarter?'selected':'')+'>Q'+q+'</option>').join('')+'</select></label><p>Beoordeel per factuur of deze een Nederlandse binnenlandse transactie is. Andere situaties blijven buiten de voorlopige aangifterubrieken.</p><div id="hpm-vat-summary"></div><div id="hpm-review-list"></div></div>';
  const y=root.querySelector('#hpm-year-summary');
  const add=(label,value)=>{const row=document.createElement('div');row.className='row';const a=document.createElement('span'),b=document.createElement('b');a.textContent=label;b.textContent=value;row.append(a,b);y.append(row)};
  add('Omzet excl. btw',eur(sum(sales,'net')));add('Inkoop excl. btw',eur(sum(purchases,'net')));add('Verschil vóór fiscale correcties',eur(sum(sales,'net')-sum(purchases,'net')));add('Btw op verkopen',eur(sum(sales,'vat')));add('Btw op inkopen (niet automatisch aftrekbaar)',eur(sum(purchases,'vat')));add('Aantal verkoopfacturen',String(sales.length));add('Aantal inkoopfacturen',String(purchases.length));
  root.querySelector('#hpm-report-year').onchange=e=>{window.hpmReportYear=e.target.value;this.mount({data,save,eur})};
  root.querySelector('#hpm-report-quarter').onchange=e=>{window.hpmReportQuarter=Number(e.target.value);this.mount({data,save,eur})};
  const reviewList=root.querySelector('#hpm-review-list'),summary=root.querySelector('#hpm-vat-summary');
  function recalc(){
    const approved=qRecords.filter(x=>data.vatReviews[x.id]?.status==='domestic');
    const unreviewed=qRecords.filter(x=>data.vatReviews[x.id]?.status!=='domestic');
    const sales21=approved.filter(x=>x.kind==='sale'&&data.vatReviews[x.id].rate==='21');
    const sales9=approved.filter(x=>x.kind==='sale'&&data.vatReviews[x.id].rate==='9');
    const sales0=approved.filter(x=>x.kind==='sale'&&data.vatReviews[x.id].rate==='0');
    const eligible=approved.filter(x=>x.kind==='purchase'&&data.vatReviews[x.id].deductible);
    const rows=[['1a · Omzet 21% (gecontroleerd)',eur(sum(sales21,'net'))],['1a · Btw 21% (gecontroleerd)',eur(sum(sales21,'vat'))],['1b · Omzet 9% (gecontroleerd)',eur(sum(sales9,'net'))],['1b · Btw 9% (gecontroleerd)',eur(sum(sales9,'vat'))],['Omzet 0% · nadere rubriekcontrole',eur(sum(sales0,'net'))],['5b · Voorbelasting gecontroleerd',eur(sum(eligible,'vat'))],['Voorlopig saldo 1a + 1b − 5b',eur(sum(sales21,'vat')+sum(sales9,'vat')-sum(eligible,'vat'))],['Niet volledig ingedeelde facturen',String(unreviewed.length)]];
    summary.replaceChildren();
    rows.forEach(([label,value])=>{const row=document.createElement('div');row.className='row';const a=document.createElement('span'),b=document.createElement('b');a.textContent=label;b.textContent=value;row.append(a,b);summary.append(row)});
    const warning=document.createElement('p');warning.className='notice';warning.textContent='Geen officiële aangifte: overige btw-rubrieken, verleggingen, EU/import, correcties en afrondingen zijn nog niet verwerkt. Bij twijfel kies Niet ingedeeld.';summary.append(warning);
  }
  qRecords.sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(x=>{
    const wrap=document.createElement('div');wrap.className='card';wrap.style.margin='10px 0';
    const heading=document.createElement('strong');heading.textContent=(x.kind==='sale'?'Verkoop · ':'Inkoop · ')+(x.date||'')+' · '+(x.party||'')+' · '+(x.number||'')+' · '+eur(x.gross);wrap.append(heading);
    const select=document.createElement('select');select.style.marginTop='10px';[['','Niet ingedeeld / nader controleren'],['domestic','Nederlandse binnenlandse factuur'],['other','Buitenland, verlegd, vrijgesteld of anders']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;select.append(o)});
    const review=data.vatReviews[x.id]||{};select.value=review.status||'';wrap.append(select);
    const rate=document.createElement('select');[['','Tarief controleren'],['21','21%'],['9','9%'],['0','0%']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;rate.append(o)});rate.value=review.rate||'';wrap.append(rate);
    const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.style.width='auto';check.checked=!!review.deductible;label.append(check,document.createTextNode(' Voorbelasting aftrekbaar (zelf beoordeeld)'));if(x.kind==='purchase')wrap.append(label);
    const btn=document.createElement('button');btn.textContent='Btw-beoordeling bewaren';btn.style.marginTop='10px';wrap.append(btn);
    const notice=document.createElement('small');notice.style.display='block';wrap.append(notice);
    btn.onclick=async()=>{
      if(select.value==='domestic'&&!rate.value){notice.textContent='Selecteer eerst het btw-tarief.';return}
      if(select.value==='domestic'&&rate.value){const expected=Number(x.net)*Number(rate.value)/100;if(Math.abs(expected-Number(x.vat))>0.06){notice.textContent='Btw-bedrag wijkt af van gekozen tarief. Controleer de factuur of splits verschillende tarieven.';return}}
      const previous=data.vatReviews[x.id];
      data.vatReviews[x.id]={status:select.value,rate:rate.value,deductible:x.kind==='purchase'&&select.value==='domestic'&&check.checked,reviewedAt:new Date().toISOString()};
      try{await save();notice.textContent='Beoordeling opgeslagen';recalc()}catch(e){if(previous)data.vatReviews[x.id]=previous;else delete data.vatReviews[x.id];notice.textContent='Opslaan mislukt: '+e.message}
    };
    reviewList.append(wrap);
  });
  if(!qRecords.length)reviewList.textContent='Geen facturen in dit kwartaal.';
  recalc();
 }
};