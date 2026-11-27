/* One workbook per disposable worker. No application tokens or database access. */
'use strict';
self.onmessage = ({data}) => {
  try {
    if (!(data instanceof ArrayBuffer) || data.byteLength > 5*1024*1024) throw Error('size');
    importScripts('xlsx.full.min.js');
    const wb = XLSX.read(data,{type:'array',cellFormula:false,cellHTML:false,cellStyles:false});
    if (!wb.SheetNames.length || wb.SheetNames.length>100) throw Error('sheets');
    let total=0;
    let chars=0;
    const sheets=wb.SheetNames.map(name=>{
      const ws=wb.Sheets[name];
      if (!ws || !ws['!ref']) return {name,rows:[]};
      const r=XLSX.utils.decode_range(ws['!ref']);
      const nr=r.e.r-r.s.r+1;
      const nc=r.e.c-r.s.c+1;
      if(nr>50000||nc>256||nr<1||nc<1||(total+=nr*nc)>500000) throw Error('range');
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''}).map(row=>row.map(cell=>{const v=String(cell??'').trim();chars+=v.length;if(chars>5000000)throw Error('text');return v;}));
      return {name,rows};
    });
    self.postMessage({sheets});
  } catch (_) { self.postMessage({error:true}); }
};
