(() => {
"use strict";
const API="https://gulfjobsindia.gulfjob.workers.dev",form=document.getElementById("cvForm"),preview=document.getElementById("cvPreview"),message=document.getElementById("cvMessage"),generate=document.getElementById("generateCv"),print=document.getElementById("printCv");
let latestData=null,latestAi=null;
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function say(text,type=""){message.className="cv-message"+(type?" "+type:"");message.textContent=text;}
function render(){
 const d=latestData,ai=latestAi,contact=[d.phone,d.email,d.location].filter(Boolean).map(esc).join(" · ");
 const skills=[...new Set([...(Array.isArray(ai.skills)?ai.skills:[]),...d.skills.split(",").map(s=>s.trim()).filter(Boolean)])].slice(0,14);
 const exp=d.experience.split(/\n+/).map(s=>s.trim()).filter(Boolean),bullets=Array.isArray(ai.experience_bullets)?ai.experience_bullets:[];
 preview.innerHTML=`<header class="cv-document-head"><h2>${esc(d.full_name)}</h2><h3>${esc(ai.headline||d.target_role)}</h3><div class="cv-contact">${contact}</div></header>
 ${d.experience_years?"<section><h4>Experience</h4><p>"+esc(d.experience_years)+"</p></section>":""}
 <section><h4>Professional Summary</h4><p>${esc(ai.summary||"Experienced professional seeking an opportunity in the Gulf region.")}</p></section>
 <section><h4>Work Experience</h4><p class="cv-experience-text">${exp.map(esc).join("\n")}</p>${bullets.length?"<ul>"+bullets.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>":""}</section>
 ${skills.length?"<section><h4>Key Skills</h4><div class='cv-skills'>"+skills.map(x=>"<span>"+esc(x)+"</span>").join("")+"</div></section>":""}
 ${d.education?"<section><h4>Education</h4><p>"+esc(d.education)+"</p></section>":""}
 ${d.languages?"<section><h4>Languages</h4><p>"+esc(d.languages)+"</p></section>":""}
 ${d.certifications?"<section><h4>Certifications</h4><p>"+esc(d.certifications)+"</p></section>":""}
 <p class="cv-footnote">Information provided by the candidate. Please verify all details before submission.</p>`;
 print.disabled=false;
}
form.addEventListener("submit",async event=>{
 event.preventDefault();if(!form.reportValidity())return;
 latestData=Object.fromEntries(new FormData(form).entries());generate.disabled=true;generate.textContent="Creating your CV…";say("AI aapke experience ko professional CV format mein likh raha hai…");
 try{
  const payload={target_role:latestData.target_role,country:latestData.country,experience_years:latestData.experience_years,experience:latestData.experience,education:latestData.education,skills:latestData.skills,languages:latestData.languages,certifications:latestData.certifications};
  const response=await fetch(API+"/api/cv/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"AI CV generate nahi hua.");
  latestAi=data;render();say("Professional CV ready hai. Details verify karke A4 PDF save karein.","success");
 }catch(error){say(error.message||"Network error. Dobara try karein.","error");}
 finally{generate.disabled=false;generate.textContent="✦ Generate CV with AI";}
});
print.addEventListener("click",()=>{if(latestData&&latestAi)window.print();});
form.addEventListener("reset",()=>{latestData=null;latestAi=null;print.disabled=true;preview.innerHTML='<div class="cv-empty"><span>✦</span><h3>Your professional CV will appear here</h3><p>Fill your details and select “Generate CV with AI”.</p></div>';say("");});
})();