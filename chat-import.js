'use strict';
window.HPMChatImport={
 mount({data,save,render,initial}){
  const root=document.getElementById('view');
  root.innerHTML='<div class="card"><h2>HPM Factuurassistent</h2><p>Plak de JSON die je in de aparte ChatGPT-chat hebt gecontroleerd. Er wordt niets naar GitHub verstuurd.</p><label>Gecontroleerde factuurgegevens<textarea id="hpm-chat-json" rows="12" style="width:100%;box-sizing:border-box;font:13px monospace;padding:12px"></textarea></label><p><button id="hpm-chat-paste" type="button">Plakken vanaf klembord</button> <button id="hpm-chat-check">Controleer import</button></p><div id="hpm-chat-result" aria-live="polite"></div></div>';
  const input=root.querySelector('#hpm-chat-json'),result=root.querySelector('#hpm-chat-result');
  if(initial){input.value=JSON.stringify(initial,null,2);const note=document.createElement('p');note.textContent='Importlink ontvangen. Controleer de factuur voordat je deze opslaat.';root.insertBefore(note,root.firstChild)}
  root.querySelector('#hpm-chat-paste').onclick=async()=>{try{input.value=await navigator.clipboard.readText();input.focus()}catch(e){result.textContent='Klembord niet toegankelijk. Houd het tekstvak ingedrukt en kies Plak.'}};
  root.querySelector('#hpm-chat-check').onclick=()=>{
   result.replaceChildren();
   try{
    const raw=JSON.parse(input.value);
    if(raw.format!=='hpm-invoice-v1')throw Error('Gebruik formaat hpm-invoice-v1.');
    const entries=Array.isArray(raw.invoices)?raw.invoices:[raw.invoice];
    if(!entries.length||entries.length>30)throw Error('Gebruik 1 tot 30 facturen per import.');
    const valid=[],duplicates=[];
    for(const x of entries){
      if(!x||!['purchase','sale'].includes(x.type))throw Error('type moet purchase of sale zijn.');
      const date=String(x.date||''),party=String(x.party||'').trim(),number=String(x.number||'').trim(),description=String(x.description||'').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))throw Error('Ongeldige datum.');
      if(!party||!number||!description)throw Error('Leverancier/klant, factuurnummer en omschrijving zijn verplicht.');
      const gross=Number(x.gross),vat=Number(x.vat),net=Number(x.net);
      if(![gross,vat,net].every(Number.isFinite)||gross<=0||vat<0||net<0||Math.abs(gross-vat-net)>0.025)throw Error('Bedragen kloppen niet voor '+number);
      const target=x.type==='purchase'?data.purchases:data.sales;
      const exists=target.some(y=>String(y.number||'').trim().toLowerCase()===number.toLowerCase()&&String(y.party||'').trim().toLowerCase()===party.toLowerCase());
      if(exists||valid.some(y=>y.type===x.type&&y.number.toLowerCase()===number.toLowerCase()&&y.party.toLowerCase()===party.toLowerCase())){duplicates.push(number);continue}
      valid.push({type:x.type,date,party,number,description,gross:Math.round(gross*100)/100,vat:Math.round(vat*100)/100,net:Math.round(net*100)/100,payment:String(x.payment||'Nog controleren'),items:Array.isArray(x.items)?x.items.map(v=>String(v).slice(0,300)):[]});
    }
    const p=document.createElement('p');p.textContent=valid.length+' nieuwe factuur/facturen; '+duplicates.length+' mogelijke duplicaten overgeslagen.';result.append(p);
    valid.forEach(x=>{const row=document.createElement('p');row.textContent=x.date+' · '+x.party+' · '+x.number+' · € '+x.gross.toFixed(2)+' (btw € '+x.vat.toFixed(2)+')';result.append(row)});
    if(!valid.length)return;
    const btn=document.createElement('button');btn.textContent='Importeer '+valid.length+' gecontroleerde factuur/facturen';result.append(btn);
    btn.onclick=async()=>{
      if(!confirm('Voeg '+valid.length+' facturen toe? Bestaande boekingen blijven staan.'))return;
      const previousPurchases=data.purchases.slice(),previousSales=data.sales.slice();
      try{
        for(const x of valid){const {type,...entry}=x;(type==='purchase'?data.purchases:data.sales).push({id:crypto.randomUUID(),...entry,source:'HPM Factuurassistent'})}
        await save();alert('Import opgeslagen.');render();
      }catch(e){data.purchases.splice(0,data.purchases.length,...previousPurchases);data.sales.splice(0,data.sales.length,...previousSales);alert('Opslaan mislukt: '+e.message)}
    };
   }catch(e){result.textContent='Import niet mogelijk: '+e.message}
  };
  if(initial)root.querySelector('#hpm-chat-check').click();
 }
};