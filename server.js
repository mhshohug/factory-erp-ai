const express = require("express");
const axios = require("axios");
const cors = require("cors");
const moment = require("moment");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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


// ================= DATE NORMALIZER =================
function normalizeSheetDate(value){

    if(!value) return "";

    value=value.toString().trim();

    if(!isNaN(value) && Number(value)>40000)
        return moment("1899-12-30").add(Number(value),'days').format("DD-MMM-YYYY");

    const formats=[
        "DD-MMM-YYYY","D-MMM-YYYY",
        "DD/MM/YYYY","D/M/YYYY",
        "YYYY-MM-DD",
        "DD-MMM-YY","D-MMM-YY",
        "DD-MMM-YYYY HH:mm:ss"
    ];

    const m=moment(value,formats,true);
    if(m.isValid()) return m.format("DD-MMM-YYYY");

    return value.toUpperCase();
}


// ================= AI DATE UNDERSTAND =================
function getParsedDate(q){

    if(q.includes("today")||q.includes("aj"))
        return moment().format("DD-MMM-YYYY");

    if(q.includes("yesterday")||q.includes("kal"))
        return moment().subtract(1,'days').format("DD-MMM-YYYY");

    if(q.includes("porshu"))
        return moment().subtract(2,'days').format("DD-MMM-YYYY");

    const match=q.match(/(\d+)\s*([a-z]+)/);
    if(!match) return null;

    let day=match[1];
    let mon=match[2];

    let year=moment().year();
    if(moment(`${day} ${mon} ${year}`,"D MMM YYYY").isAfter(moment()))
        year--;

    return moment(`${day} ${mon} ${year}`,"D MMM YYYY").format("DD-MMM-YYYY");
}



// ================= ASK =================
app.post("/ask", async (req,res)=>{

const q=(req.body.question||"").toLowerCase().trim();

const sheets=await Promise.all(Object.values(GID_MAP).map(fetchSheet));
const [grey,sing,marc,cpb,jet,jig,roll]=sheets;


// ===== DATE SEARCH =====
const dateInput=getParsedDate(q);

if(dateInput && !q.match(/sill\s*(\d+)/) && !q.match(/^\d+$/)){

const sections={singing:sing,marcerise:marc,cpb:cpb,jet:jet,jigger:jig,rolling:roll};
let targetKey=Object.keys(sections).find(s=>q.includes(s));


// ---- section wise ----
if(targetKey){

let details=[],total=0;

// CPB এখন G column (index 6)
let vIdx=(targetKey==="singing"||targetKey==="marcerise")?8:(targetKey==="jet"||targetKey==="cpb"?6:7);

sections[targetKey].forEach(r=>{

if(normalizeSheetDate(r[0])===normalizeSheetDate(dateInput)){

let sNum=r[1]||"N/A";
let val=parseFloat((r[vIdx]||"").replace(/,/g,''))||0;

if(val>0){
details.push(`🔹 Sill ${sNum}: ${val.toLocaleString()} yds`);
total+=val;
}
}
});

if(details.length)
return res.json({reply:`📅 **${targetKey.toUpperCase()} - ${dateInput}**
━━━━━━━━━━━━━━━━
${details.join("\n")}

📍 **Total: ${total.toLocaleString()} yds**`});

return res.json({reply:`📅 ${dateInput} এ ${targetKey} সেকশনে কোনো ডাটা পাওয়া যায়নি।`});
}


// ---- daily summary ----
const dSum=(rows,idx)=>rows.reduce((acc,r)=>
normalizeSheetDate(r[0])===normalizeSheetDate(dateInput)
? acc+(parseFloat((r[idx]||"").replace(/,/g,''))||0)
: acc,0);

// CPB index = 6
const cVal=dSum(cpb,6),jVal=dSum(jet,6),jgVal=dSum(jig,7);

return res.json({reply:`📅 **Daily Summary: ${dateInput}**
━━━━━━━━━━━━━━━━
🔹 Singing: ${dSum(sing,8).toLocaleString()} yds
🔹 Marcerise: ${dSum(marc,8).toLocaleString()} yds
🔹 CPB: ${cVal.toLocaleString()} yds
🔹 Jet: ${jVal.toLocaleString()} yds
🔹 Jigger: ${jgVal.toLocaleString()} yds
📍 **Total Dyeing: ${(cVal+jVal+jgVal).toLocaleString()} yds**
✅ **Rolling: ${dSum(roll,7).toLocaleString()} yds`});
}



// ===== SILL REPORT =====
let sMatch=q.match(/(\d+)/);
if(sMatch && !q.includes("total")){

const sill=sMatch[1];
const gRow=grey.find(r=>(r[2]||"").trim()===sill);
if(!gRow) return res.json({reply:`Sill ${sill} পাওয়া যায়নি ওস্তাদ।`});

const getVal=(rows,s,sIdx,vIdx)=>rows.reduce((a,r)=>r[sIdx]===s?a+(parseFloat((r[vIdx]||"").replace(/,/g,''))||0):a,0);

const data={
sing:getVal(sing,sill,1,8),
marc:getVal(marc,sill,1,8),
cpb:getVal(cpb,sill,1,6), // CPB G column
jet:getVal(jet,sill,1,6),
jig:getVal(jig,sill,1,7),
roll:getVal(roll,sill,1,7)
};

const lotSize=parseFloat((gRow[6]||"").replace(/,/g,''))||0;
const diff=lotSize-data.roll;

return res.json({reply:`📊 **Report: Sill ${sill}**
━━━━━━━━━━━━━━━━
👤 **Party:** ${gRow[3]}
📜 **Quality:** ${gRow[4]}
📦 **Lot Size:** ${lotSize.toLocaleString()} yds

⚙️ **Process Details:**
🔹 Singing: ${data.sing.toLocaleString()} yds
🔹 Marcerise: ${data.marc.toLocaleString()} yds

🎨 **Dyeing Section:**
🔹 CPB: ${data.cpb.toLocaleString()} yds
🔹 Jet: ${data.jet.toLocaleString()} yds
🔹 Jigger: ${data.jig.toLocaleString()} yds
📍 **Total Dyeing: ${(data.cpb+data.jet+data.jig).toLocaleString()} yds

✅ **Rolling: ${data.roll.toLocaleString()} yds**
━━━━━━━━━━━━━━━━
📊 **${diff<=0?"Extra":"Short"}: ${Math.abs(diff).toLocaleString()} yds**`});
}



// ===== TOTAL =====
if(q.includes("total")){

const tSum=(rows,idx)=>rows.reduce((a,r)=>a+(parseFloat((r[idx]||"").replace(/,/g,''))||0),0);

// CPB index 6
const t={s:tSum(sing,8),m:tSum(marc,8),c:tSum(cpb,6),j:tSum(jet,6),jg:tSum(jig,7),r:tSum(roll,7)};

if(q.includes("dyeing"))
return res.json({reply:`🌍 **Monthly Dyeing Report**
━━━━━━━━━━━━━━━━
🔹 CPB: ${t.c.toLocaleString()} yds
🔹 Jet: ${t.j.toLocaleString()} yds
🔹 Jigger: ${t.jg.toLocaleString()} yds
📍 **Total Dyeing: ${(t.c+t.j+t.jg).toLocaleString()} yds`});

return res.json({reply:`🌍 **Monthly Grand Total**
━━━━━━━━━━━━━━━━
🔹 Singing: ${t.s.toLocaleString()} yds
🔹 Marcerise: ${t.m.toLocaleString()} yds
🔹 CPB: ${t.c.toLocaleString()} yds
🔹 Jet: ${t.j.toLocaleString()} yds
🔹 Jigger: ${t.jg.toLocaleString()} yds
✅ **Total Rolling: ${t.r.toLocaleString()} yds`});
}

res.json({reply:"Sill নম্বর বা তারিখ (e.g. 3 feb jet / kal cpb) লিখে সার্চ দিন ওস্তাদ!"});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("Server running on "+PORT));
// ===== AUTO WAKEUP PING =====
const https = require("https");

const URL = "https://factory-erp-ai-9fqf.onrender.com/";

setInterval(() => {
    https.get(URL, (res) => {
        console.log("Self ping:", res.statusCode);
    }).on("error", (err) => {
        console.log("Ping error:", err.message);
    });
}, 240000); // 4 minutes
