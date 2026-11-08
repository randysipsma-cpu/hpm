'use strict';
/* Entirely local extraction. No requests, no analytics, no remote OCR. */
const InvoiceScan=(()=>{
const txt=x=>String(x||'').replace(/\s+/g,' ').trim();
function numbers(str){return [...String(str).matchAll(/(?:€\s*)?(-?(?:\d{1,3}(?:[., ]\d{3})+|\d+)[.,]\d{2})(?!\d)/g)].map(m=>{let raw=m[1].replace(/\s/g,''),last=Math.max(raw.lastIndexOf(','),raw.lastIndexOf('.')),value=Number(raw.slice(0,last).replace(/[.,]/g,'')+'.'+raw.slice(last+1));return {value,raw:m[0]}}).filter(x=>Number.isFinite(x.value))}
function guess(text){
let lines=text.split(/\r?\n/).map(txt).filter(Boolean),whole=lines.join('\n');
let date=(whole.match(/(?:factuurdatum|invoice\s*date|datum)\s*[:#-]?\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}-\d{2}-\d{2})/i)||whole.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/)||[])[1]||'';
if(date&&!/^\d{4}-/.test(date)){let p=date.split(/[-/.]/);date=p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0')}
let number=(whole.match(/(?:factuurnummer|factuurnr\.?|invoice\s*(?:number|no\.?|#))\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_.-]{2,})/i)||[])[1]||'';
function amount(re){for(let l of lines){if(re.test(l)){let n=numbers(l);if(n.length)return n[n.length-1].value}}return null}
// Prefer labelled invoice totals over outstanding balance or line-item values.
function labelled(re, {allowNext=true,positive=false}={}){
  let found=[];
  for(let i=0;i<lines.length;i++){
    if(!re.test(lines[i]))continue;
    let n=numbers(lines[i]);
    if(n.length===1)found.push(n[0].value);
    else if(!n.length&&allowNext){
      let next=lines[i+1]||'',v=numbers(next);
      if(v.length===1&&/^(?:€\s*)?\d+[.,]\d{2}\s*$/.test(next))found.push(v[0].value);
    }
  }
  return [...new Set(found)].filter(v=>!positive||v>0);
}
const grossCandidates=labelled(/(?:grand\s*total|net\s*payment|total\s*amount\s*payable|total\s*\(incl\.?\s*(?:vat|btw)\)|totaal\s*\(incl\.?\s*btw\)|totaal\s*incl(?:usief)?\s*btw|totaal\s*verschuldigd)/i,{positive:true});
const netCandidates=labelled(/(?:total\s*exclude\s*tax|total\s*excl(?:uding)?\s*(?:vat|tax)|total\s*\(excl\.?\s*(?:vat|btw)\)|totaal\s*\(excl\.?\s*btw\)|totaal\s*excl(?:usief)?\s*btw|netto\s*(?:sub)?totaalbedrag|subtotal\s*net\s*amount)/i);
const vatCandidates=labelled(/(?:^|[\s!;])(?:tax\s+NL\s+btw|total\s+(?:vat|tax)|total\s+VAT\s+amount\s+payable|totaal\s+verschuldigde\s*btw|btw\s*bedrag|btw-bedrag|vat\s*amount|tax\s*amount)\b/i);
for(let i=0;i<lines.length;i++){
  const l=lines[i];
  if(/(?:^|[\s!;])tax\s+NL\s+btw\s*\(?\s*\d{1,2}%/i.test(l)){
    let n=numbers(l),next=numbers(lines[i+1]||'');
    if(n.length===1)vatCandidates.push(n[0].value);
    else if(next.length===1)vatCandidates.push(next[0].value);
  }
}
// Dutch invoice summary: OCR frequently puts net, VAT and gross on one row.
const triples=[];
for(let i=0;i<lines.length;i++){
 const line=lines[i],vals=numbers(line).map(x=>x.value);
 const context=(lines[i-1]||'')+' '+line;
 const summaryContext=/(?:subtotaal\s+btw\s+totaal|excl\.?\s*btw\s+btw\s*bedrag|netto\s*(?:sub)?totaalbedrag)/i.test(context);
 const dateRow=/(?:verzenddatum|factuurdatum|invoice\s*date)/i.test(line);
 if(vals.length>=3&&(summaryContext||dateRow)){
  const tail=vals.slice(-3);
  if(tail[0]>0&&tail[1]>=0&&Math.abs(tail[0]+tail[1]-tail[2])<0.025)triples.push(tail);
 }
}
let gross=null,net=null,vat=null;
if(triples.length===1){[net,vat,gross]=triples[0]}
outer: for(let g of grossCandidates)for(let n of netCandidates)for(let v of vatCandidates){
  if(gross===null&&g>0&&n>=0&&v>=0&&Math.abs(g-n-v)<0.025){gross=g;net=n;vat=v;break outer}
}
if(gross===null&&netCandidates.length===1&&vatCandidates.length===1&&grossCandidates.length===0){
 net=netCandidates[0];vat=vatCandidates[0];gross=Math.round((net+vat)*100)/100;
}
if(gross===null||vat===null||net===null||gross<=0||vat<0){
 let err=Error('Factuurtotaal, exclusief btw en btw konden niet betrouwbaar worden gecontroleerd.');
 err.ocrText=whole;err.candidates={grossCandidates,netCandidates,vatCandidates,triples};throw err;
}
let rate=net>0?Math.round(vat/net*100):0;if(![0,9,21].includes(rate))rate=null;
return {date,number,gross,vat,net,rate,party:lines.slice(0,7).find(l=>/bambu\s*lab|jingdong|anycubic/i.test(l))||'',description:'Factuur '+(number||''),text:whole};
}
async function pdf(file){let b=new Uint8Array(await file.arrayBuffer()),raw=new TextDecoder('latin1').decode(b);if(!raw.startsWith('%PDF'))throw Error('Geen geldig PDF-bestand');let fragments=[];let streams=[...raw.matchAll(/stream\r?\n/g)];for(let m of streams){let start=m.index+m[0].length,end=raw.indexOf('endstream',start);if(end<0)continue;let head=raw.slice(Math.max(0,m.index-250),m.index),bytes=b.slice(start,end-(raw[end-1]==='\n'?1:0));try{if(/\/FlateDecode/.test(head)){if(!('DecompressionStream'in window))continue;let ds=new DecompressionStream('deflate');bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer())}let s=new TextDecoder('latin1').decode(bytes);for(let match of s.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ/g)){let part=match[0];let strings=[...part.matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map(x=>x[1].replace(/\\([()\\])/g,'$1').replace(/\\n/g,' '));if(strings.length)fragments.push(strings.join(''))}}catch(e){}}
let t=fragments.join('\n');if(t.length<15)throw Error('Deze PDF bevat geen eenvoudig uitleesbare tekst. Gescan­de PDF’s en sommige lettertypen vereisen OCR.');return t}
let ocrWorker=null;
async function recognizeImage(file){if(!window.Tesseract)throw Error('Offline OCR-bestanden zijn nog niet geïnstalleerd. Probeer later opnieuw.');
if(!ocrWorker){ocrWorker=await Tesseract.createWorker('nld+eng',1,{workerPath:'./vendor/ocr/worker.min.js',corePath:'./vendor/core',langPath:'./vendor/lang',workerBlobURL:false,gzip:true});}
let result=await ocrWorker.recognize(file);return result.data.text||'';}
async function scanPdf(file){
if(!window.pdfjsLib)throw Error('PDF-module nog niet geladen. Wacht tot GitHub de update heeft gepubliceerd.');
pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf/pdf.worker.min.js';
let doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
if(doc.numPages>12)throw Error('Deze PDF heeft meer dan 12 pagina’s. Splits het document eerst.');
let pages=[];
for(let i=1;i<=doc.numPages;i++){
let page=await doc.getPage(i);
let content=await page.getTextContent();
let extracted=content.items.map(x=>x.str||'').join(' ');
if(extracted.length>80){pages.push(extracted);continue}
let viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');
canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
let ctx=canvas.getContext('2d',{alpha:false});await page.render({canvasContext:ctx,viewport}).promise;
let blob=await new Promise(ok=>canvas.toBlob(ok,'image/png'));if(!blob)throw Error('Kan PDF-pagina niet omzetten');
pages.push(await recognizeImage(blob));canvas.width=0;canvas.height=0;
}
return guess(pages.join('\n'));
}
async function extract(file){if(file.size>12*1024*1024)throw Error('Bestand is groter dan 12 MB');
if(file.type==='application/pdf'||/\.pdf$/i.test(file.name))return scanPdf(file);
if(file.type.startsWith('image/')){let t=await recognizeImage(file);if(t.trim().length<10)throw Error('Geen leesbare tekst gevonden. Maak een scherpere foto.');return guess(t)}
throw Error('Gebruik PDF, JPG of PNG')}
function attach(buy,arr,save,render){let add=document.getElementById('add');if(!add||document.getElementById('scanbox'))return;let box=document.createElement('div');box.id='scanbox';box.innerHTML='<p><label>Factuur lokaal analyseren (PDF/JPG/PNG)<input id="invoice-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"></label></p><small>Bestand blijft op je iPhone. Controleer alle bedragen vóór opslaan. OCR wordt lokaal uitgevoerd, zonder upload naar een server.</small><div id="scan-status" aria-live="polite"></div>';add.insertAdjacentElement('afterend',box);
box.querySelector('input').onchange=async e=>{let f=e.target.files[0];if(!f)return;let status=box.querySelector('#scan-status');document.getElementById('form').replaceChildren();status.textContent='Factuur lokaal analyseren…';try{let d=await extract(f);status.textContent='Controleer de voorgestelde gegevens. De factuur zelf wordt niet opgeslagen.';document.getElementById('form').innerHTML='<form id="invoice-approve"><label>Datum<input name="date" type="date" required value="'+(d.date||'')+'"></label><label>'+(buy?'Leverancier':'Klant')+'<input name="party" required></label><label>Factuurnummer<input name="number"></label><label>Omschrijving<input name="description" required></label><label>Totaal incl. btw<input name="gross" type="number" min="0.01" step="0.01" required></label><label>Btw-bedrag<input name="vat" type="number" min="0" step="0.01" required></label><label>Betaalwijze<input name="payment" value="bunq zakelijk"></label><p><button>Goedkeuren en opslaan</button></p></form>';let form=document.getElementById('invoice-approve');for(let k of ['party','number','description','gross','vat'])form.elements[k].value=d[k]??'';form.onsubmit=async ev=>{ev.preventDefault();let a=new FormData(form),gross=round(a.get('gross')),vat=round(a.get('vat'));if(vat>gross)return alert('Btw kan niet hoger zijn dan totaal');let number=String(a.get('number')||'').trim(),party=String(a.get('party')||'').trim();if(number&&arr.some(x=>x.number===number&&x.party===party))return alert('Mogelijke dubbele factuur: zelfde nummer en relatie');arr.push({id:crypto.randomUUID(),date:a.get('date'),party,number,description:a.get('description'),gross,vat,net:round(gross-vat),payment:a.get('payment'),source:'lokale-factuurherkenning'});await save();render()}}catch(err){status.textContent='Niet automatisch herkend: '+err.message+' Gebruik + Nieuw voor handmatige invoer.';if(err.ocrText){let details=document.createElement('details');let summary=document.createElement('summary');summary.textContent='Bekijk lokaal herkende tekst en bedragen';let pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:300px;overflow:auto;background:#f4efe6;padding:10px;border-radius:8px';pre.textContent='Gevonden bedragen: '+JSON.stringify(err.candidates)+'\n\n'+err.ocrText;details.append(summary,pre);status.appendChild(details);}}}}
return {attach};
})();