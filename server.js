const express = require("express");
const axios = require("axios");
const cors = require("cors");
const moment = require("moment");

const router = express.Router();
router.use(cors());
router.use(express.json());
router.use(express.static(__dirname));

const SHEET_ID = "1-2U7bkuP1cPK9EgCzksYkeOUz0LGexCZQI-oeVmDEmw";

const GID_MAP = {
    grey: "1069156463",
    singing: "291372431",
    marcerise: "890189379",
    cpb: "809334692",
    jet: "1065130625",
    jigger: "392149567",
    rolling: "1498627234"
};

async function fetchSheet(gid) {
    try {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
        const response = await axios.get(url);

        return response.data.split('\n').map(row =>
            row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
               .map(cell => cell.replace(/"/g, '').trim())
        );
    } catch {
        return [];
    }
}

const clean = s => (s || "").replace(/\s+/g,'').toLowerCase();

function normalizeSheetDate(value){
    if(!value) return "";
    value=value.toString().trim();
    if(!isNaN(value) && Number(value)>40000)
        return moment("1899-12-30").add(Number(value),'days').format("DD-MMM-YYYY");

    const formats=["DD-MMM-YYYY","D-MMM-YYYY","DD/MM/YYYY","D/M/YYYY","YYYY-MM-DD","DD-MMM-YY","D-MMM-YY","DD-MMM-YYYY HH:mm:ss"];
    const m=moment(value,formats,true);
    if(m.isValid()) return m.format("DD-MMM-YYYY");
    return value.toUpperCase();
}

function getParsedDate(q){
    if(q.includes("today")||q.includes("aj")) return moment().format("DD-MMM-YYYY");
    if(q.includes("yesterday")||q.includes("kal")) return moment().subtract(1,'days').format("DD-MMM-YYYY");
    if(q.includes("porshu")) return moment().subtract(2,'days').format("DD-MMM-YYYY");

    const match=q.match(/(\d+)\s*([a-z]+)/);
    if(!match) return null;

    let year=moment().year();
    if(moment(`${match[1]} ${match[2]} ${year}`,"D MMM YYYY").isAfter(moment())) year--;
    return moment(`${match[1]} ${match[2]} ${year}`,"D MMM YYYY").format("DD-MMM-YYYY");
}

// ================= ASK =================
router.post("/ask", async (req,res)=>{

const q=(req.body.question||"").toLowerCase().trim();
const sheets=await Promise.all(Object.values(GID_MAP).map(fetchSheet));
const [grey,sing,marc,cpb,jet,jig,roll]=sheets;
const getRollingBySill=(sill)=>{
return roll.reduce((a,r)=>(
(r[1]||"").trim()===sill
? a+(parseFloat((r[7]||"").replace(/,/g,''))||0)
: a
),0);
};

/* ================= NEW AI FEATURES START ================= */
// ===== SMART PARTY SEARCH (ANY WORD MATCH + LAST 15) =====
function normalizeName(str){
    return (str||"").toLowerCase().replace(/[\s.\-]/g,'').trim();
}

const uniqueParties=[...new Set(grey.map(r=>r[3]).filter(Boolean))];

if(!q.match(/\d/) && q.length>=2){

    let input=normalizeName(q);

    let bestMatch=uniqueParties.find(p=>{
        let np=normalizeName(p);
        return np.includes(input);
    });

    if(bestMatch){

        let rows=grey.filter(r=>normalizeName(r[3])===normalizeName(bestMatch));
        let last15=rows.slice(-15);

        let reply=`🏷️ Party: ${bestMatch.toUpperCase()}
━━━━━━━━━━━━━━━━\n`;

        last15.forEach(r=>{
            let sill=r[2]||"N/A";
            let quality=r[4]||"N/A";
            let lot=parseFloat((r[6]||"").replace(/,/g,''))||0;
            let rolling=getRollingBySill((r[2]||"").trim());
            let diff=rolling-lot;

            let status=diff>=0
            ? `Extra ${Math.abs(diff).toLocaleString()}`
            : `Short ${Math.abs(diff).toLocaleString()}`;

            reply+=`🔹 Sill ${r[2]} | ${r[4]} | Lot ${lot.toLocaleString()} | Roll ${rolling.toLocaleString()} | ${status} yds\n`;
        });

        reply+=`\n📊 Showing ${last15.length} of ${rows.length} entries`;
        return res.json({reply});
    }
}
// PARTY ONLY
let partyRows=grey.filter(r=>(r[3]||"").toLowerCase()===q);
if(partyRows.length && !q.match(/\d/)){
    let total=0,reply=`🏷️ Party: ${q.toUpperCase()}\n━━━━━━━━━━━━━━━━\n`;
    partyRows.forEach(r=>{
        let lot=parseFloat((r[6]||"").replace(/,/g,''))||0;
        total+=lot;
        reply+=`🔹 Sill ${r[2]} | ${r[4]} | ${lot.toLocaleString()} yds\n`;
    });
    reply+=`\n📊 Total Lot: ${total.toLocaleString()} yds`;
    return res.json({reply});
}

// PARTY + DATE / SECTION
const partyWord=q.split(" ")[0];
if(grey.some(r=>(r[3]||"").toLowerCase()===partyWord)&&q.includes(" ")){
    const dateInput=getParsedDate(q);
    const sections={singing:sing,marcerise:marc,cpb:cpb,jet:jet,jigger:jig,rolling:roll};
    const sectionKey=Object.keys(sections).find(s=>q.includes(s));

    let total=0,reply=`🏷️ ${partyWord.toUpperCase()} Production\n━━━━━━━━━━━━━━━━\n`;

    for(const key in sections){
        if(sectionKey&&key!==sectionKey)continue;
        let vIdx=(key==="singing"||key==="marcerise")?8:(key==="jet"||key==="cpb"?6:7);

        sections[key].forEach(r=>{
            if(dateInput && normalizeSheetDate(r[0])!==normalizeSheetDate(dateInput))return;
            if((r[1]||"").toLowerCase()!==partyWord)return;
            let val=parseFloat((r[vIdx]||"").replace(/,/g,''))||0;
            if(val>0){ total+=val; reply+=`🔹 ${key.toUpperCase()} Sill ${r[1]}: ${val.toLocaleString()} yds\n`; }
        });
    }
    if(total>0){ reply+=`\n📊 Total: ${total.toLocaleString()} yds`; return res.json({reply}); }
}

// TOP PRODUCTION
if(q.includes("top")){
    const dateInput=getParsedDate(q)||moment().format("DD-MMM-YYYY");
    let partyTotals={};
    const add=(rows,idx)=>rows.forEach(r=>{
        if(normalizeSheetDate(r[0])!==normalizeSheetDate(dateInput))return;
        let p=r[1]; let v=parseFloat((r[idx]||"").replace(/,/g,''))||0;
        if(p&&v)partyTotals[p]=(partyTotals[p]||0)+v;
    });
    add(cpb,6); add(jet,6); add(jig,7);
    let sorted=Object.entries(partyTotals).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if(sorted.length){
        let reply=`🏆 Top Production (${dateInput})\n━━━━━━━━━━━━━━━━\n`;
        sorted.forEach(([p,v],i)=>reply+=`${i+1}. ${p.toUpperCase()} — ${v.toLocaleString()} yds\n`);
        return res.json({reply});
    }
}

/* ================= ORIGINAL CODE CONTINUES ================= */

// ===== DATE SEARCH =====
const dateInput=getParsedDate(q);

if(dateInput && !q.match(/sill\s*(\d+)/) && !q.match(/^\d+$/)){

const sections={singing:sing,marcerise:marc,cpb:cpb,jet:jet,jigger:jig,rolling:roll};
let targetKey=Object.keys(sections).find(s=>q.includes(s));

if(targetKey){

let details=[],total=0;
let sillMap={};

let vIdx=(targetKey==="singing"||targetKey==="marcerise")?8:(targetKey==="jet"||targetKey==="cpb"?6:7);

sections[targetKey].forEach(r=>{

if(normalizeSheetDate(r[0])===normalizeSheetDate(dateInput)){

let sNum=r[1]||"N/A";
let val=parseFloat((r[vIdx]||"").replace(/,/g,''))||0;
if(val<=0) return;

let g=grey.find(gr=>(gr[2]||"").trim()===sNum);
let party=g?g[3]:"Unknown";
let lot=g?parseFloat((g[6]||"").replace(/,/g,''))||0:0;

if(!sillMap[sNum]){
    sillMap[sNum]={party,lot,val:0};
}
sillMap[sNum].val+=val;

}
});

Object.keys(sillMap).forEach(s=>{
    let d=sillMap[s];
    details.push(`🔹 Sill ${s} | ${d.party} | Lot ${d.lot.toLocaleString()} | ${d.val.toLocaleString()} yds`);
    total+=d.val;
});

if(details.length)
return res.json({reply:`📅 **${targetKey.toUpperCase()} - ${dateInput}**\n━━━━━━━━━━━━━━━━\n${details.join("\n")}\n\n📍 **Total: ${total.toLocaleString()} yds**`});

return res.json({reply:`📅 ${dateInput} এ ${targetKey} সেকশনে কোনো ডাটা পাওয়া যায়নি।`});
}

// daily summary
const dSum=(rows,idx)=>rows.reduce((acc,r)=>normalizeSheetDate(r[0])===normalizeSheetDate(dateInput)?acc+(parseFloat((r[idx]||"").replace(/,/g,''))||0):acc,0);
const cVal=dSum(cpb,6),jVal=dSum(jet,6),jgVal=dSum(jig,7);

return res.json({reply:`📅 **Daily Summary: ${dateInput}**\n━━━━━━━━━━━━━━━━\n🔹 Singing: ${dSum(sing,8).toLocaleString()} yds\n🔹 Marcerise: ${dSum(marc,8).toLocaleString()} yds\n🔹 CPB: ${cVal.toLocaleString()} yds\n🔹 Jet: ${jVal.toLocaleString()} yds\n🔹 Jigger: ${jgVal.toLocaleString()} yds\n📍 **Total Dyeing: ${(cVal+jVal+jgVal).toLocaleString()} yds\n✅ **Rolling: ${dSum(roll,7).toLocaleString()} yds`});
}


// ===== SILL REPORT =====
let sMatch=q.match(/(\d+)/);
if(sMatch && !q.includes("total")){

const sill=sMatch[1];
const gRow=grey.find(r=>(r[2]||"").trim()===sill);
if(!gRow) return res.json({reply:`Sill ${sill} পাওয়া যায়নি ওস্তাদ।`});

const getVal=(rows,s,sIdx,vIdx)=>rows.reduce((a,r)=>r[sIdx]===s?a+(parseFloat((r[vIdx]||"").replace(/,/g,''))||0):a,0);

const data={sing:getVal(sing,sill,1,8),marc:getVal(marc,sill,1,8),cpb:getVal(cpb,sill,1,6),jet:getVal(jet,sill,1,6),jig:getVal(jig,sill,1,7),roll:getVal(roll,sill,1,7)};
const lotSize=parseFloat((gRow[6]||"").replace(/,/g,''))||0;
const diff=lotSize-data.roll;

return res.json({reply:`📊 **Report: Sill ${sill}**\n━━━━━━━━━━━━━━━━\n👤 **Party:** ${gRow[3]}\n📜 **Quality:** ${gRow[4]}\n📦 **Lot Size:** ${lotSize.toLocaleString()} yds\n\n⚙️ **Process Details:**\n🔹 Singing: ${data.sing.toLocaleString()} yds\n🔹 Marcerise: ${data.marc.toLocaleString()} yds\n\n🎨 **Dyeing Section:**\n🔹 CPB: ${data.cpb.toLocaleString()} yds\n🔹 Jet: ${data.jet.toLocaleString()} yds\n🔹 Jigger: ${data.jig.toLocaleString()} yds\n📍 **Total Dyeing: ${(data.cpb+data.jet+data.jig).toLocaleString()} yds\n\n✅ **Rolling: ${data.roll.toLocaleString()} yds\n━━━━━━━━━━━━━━━━\n📊 **${diff<=0?"Extra":"Short"}: ${Math.abs(diff).toLocaleString()} yds**`});
}


// ===== TOTAL =====
if(q.includes("total")){
const tSum=(rows,idx)=>rows.reduce((a,r)=>a+(parseFloat((r[idx]||"").replace(/,/g,''))||0),0);
const t={s:tSum(sing,8),m:tSum(marc,8),c:tSum(cpb,6),j:tSum(jet,6),jg:tSum(jig,7),r:tSum(roll,7)};

if(q.includes("dyeing"))
return res.json({reply:`🌍 **Monthly Dyeing Report**\n━━━━━━━━━━━━━━━━\n🔹 CPB: ${t.c.toLocaleString()} yds\n🔹 Jet: ${t.j.toLocaleString()} yds\n🔹 Jigger: ${t.jg.toLocaleString()} yds\n📍 **Total Dyeing: ${(t.c+t.j+t.jg).toLocaleString()} yds`});

return res.json({reply:`🌍 **Monthly Grand Total**\n━━━━━━━━━━━━━━━━\n🔹 Singing: ${t.s.toLocaleString()} yds\n🔹 Marcerise: ${t.m.toLocaleString()} yds\n🔹 CPB: ${t.c.toLocaleString()} yds\n🔹 Jet: ${t.j.toLocaleString()} yds\n🔹 Jigger: ${t.jg.toLocaleString()} yds\n✅ **Total Rolling: ${t.r.toLocaleString()} yds`});
}

// ===== SMART DIRECT SEARCH =====
const secDetect=(q)=>{
if(/cpb/.test(q)) return "cpb";
if(/\bjet\b/.test(q)) return "jet";
if(/jig|jiger|jigger|jg/.test(q)) return "jigger";
if(/roll/.test(q)) return "rolling";
if(/sing/.test(q)) return "singing";
if(/mar|merc/.test(q)) return "marcerise";
return null;
};

const sectionKey=secDetect(q);

if(sectionKey){

const sectionMap={singing:sing,marcerise:marc,cpb:cpb,jet:jet,jigger:jig,rolling:roll};
const rows=sectionMap[sectionKey];

let sMatch=q.match(/\b\d{3,4}\b/);
if(sMatch){

let sill=sMatch[0];
let g=grey.find(r=>(r[2]||"").trim()===sill);
let party=g?g[3]:"Unknown";
let lot=g?parseFloat((g[6]||"").replace(/,/g,''))||0:0;

let total=0,lines=[];

rows.forEach(r=>{
if((r[1]||"").trim()===sill){

let date=normalizeSheetDate(r[0]);
let vIdx=(sectionKey==="singing"||sectionKey==="marcerise")?8:(sectionKey==="jet"||sectionKey==="cpb"?6:7);
let val=parseFloat((r[vIdx]||"").replace(/,/g,''))||0;
if(val<=0) return;

lines.push(`🔹 ${date} | ${val.toLocaleString()} yds`);
total+=val;
}
});

if(lines.length)
return res.json({reply:`📊 ${sectionKey.toUpperCase()} History — Sill ${sill}
━━━━━━━━━━━━━━━━
${lines.join("\n")}

📍 Total ${sectionKey.toUpperCase()}: ${total.toLocaleString()} yds`});
}

}

res.json({reply:"Sill নম্বর বা তারিখ (e.g. 3 feb jet / kal cpb) লিখে সার্চ দিন ওস্তাদ!"});
});

module.exports = router;    
