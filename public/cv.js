(() => {
"use strict";
const API="https://gulfjobsindia.gulfjob.workers.dev",form=document.getElementById("cvForm"),preview=document.getElementById("cvPreview"),message=document.getElementById("cvMessage"),generate=document.getElementById("generateCv"),print=document.getElementById("printCv"),photoInput=document.getElementById("cvPhoto"),promptInput=document.getElementById("designPrompt"),accentInput=document.getElementById("cvAccent"),positionInput=document.getElementById("photoPosition"),applyDesign=document.getElementById("applyDesign");
let latestData=null,latestAi=null,photoData="";
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function say(text,type=""){message.className="cv-message"+(type?" "+type:"");message.textContent=text;}
function render(){
 const d=latestData,ai=latestAi,contact=[d.phone,d.email,d.location].filter(Boolean).map(esc).join(" · ");
 const skills=[...new Set([...(Array.isArray(ai.skills)?ai.skills:[]),...d.skills.split(",").map(s=>s.trim()).filter(Boolean)])].slice(0,14);
 const exp=d.experience.split(/\n+/).map(s=>s.trim()).filter(Boolean),bullets=Array.isArray(ai.experience_bullets)?ai.experience_bullets:[];
 const responsibilities=Array.isArray(ai.responsibilities)?ai.responsibilities:[];
 preview.innerHTML=`<div class="cv-document" id="cvDocument"><header class="cv-document-head"><div class="cv-head-copy"><h2 contenteditable="true" data-editable="true">${esc(d.full_name)}</h2><h3 contenteditable="true" data-editable="true">${esc(ai.headline||d.target_role)}</h3><div class="cv-contact" contenteditable="true" data-editable="true">${contact}</div></div>${photoData?`<img class="cv-profile-photo" src="${photoData}" alt="Candidate photo">`:""}</header>
 ${d.experience_years?"<section><h4>Experience</h4><p contenteditable='true' data-editable='true'>"+esc(d.experience_years)+"</p></section>":""}
 <section><h4>Professional Summary</h4><p contenteditable="true" data-editable="true">${esc(ai.summary||"Experienced professional seeking an opportunity in the Gulf region.")}</p></section>
 <section><h4>Target Role Profile</h4><p contenteditable="true" data-editable="true">${esc(ai.role_profile||"")}</p></section>
 <section><h4>Work Experience</h4><p class="cv-experience-text" contenteditable="true" data-editable="true">${exp.map(esc).join("\n")}</p>${bullets.length?"<ul>"+bullets.map(x=>"<li contenteditable='true' data-editable='true'>"+esc(x)+"</li>").join("")+"</ul>":""}</section>
 ${responsibilities.length?"<section><h4>Role-related Responsibilities</h4><ul>"+responsibilities.map(x=>"<li contenteditable='true' data-editable='true'>"+esc(x)+"</li>").join("")+"</ul></section>":""}
 ${skills.length?"<section><h4>Key Skills</h4><div class='cv-skills'>"+skills.map(x=>"<span contenteditable='true' data-editable='true'>"+esc(x)+"</span>").join("")+"</div></section>":""}
 ${d.education?"<section><h4>Education</h4><p contenteditable='true' data-editable='true'>"+esc(d.education)+"</p></section>":""}
 ${d.languages?"<section><h4>Languages</h4><p contenteditable='true' data-editable='true'>"+esc(d.languages)+"</p></section>":""}
 ${d.certifications?"<section><h4>Certifications</h4><p contenteditable='true' data-editable='true'>"+esc(d.certifications)+"</p></section>":""}
 <p class="cv-footnote">Information provided by the candidate. Please verify all details before submission.</p></div>`;
 print.disabled=false;applyStyle();
}
function applyStyle(){
 const doc=document.getElementById("cvDocument");if(!doc)return;
 const prompt=(promptInput.value||"").toLowerCase();
 const colors={navy:"#123b68",blue:"#1559a6",green:"#087454",maroon:"#7b2d43",red:"#a52d36",black:"#292929",purple:"#7047a3",orange:"#c56b19",teal:"#087e83",brown:"#795548"};
 let accent=accentInput.value||"#0b5f49";
 for(const [name,hex] of Object.entries(colors))if(prompt.includes(name)){accent=hex;accentInput.value=hex;break;}
 doc.style.setProperty("--cv-accent",accent);
 doc.classList.toggle("photo-left",positionInput.value==="left"||prompt.includes("photo on left"));
 doc.classList.toggle("cv-modern",prompt.includes("modern")||prompt.includes("minimal"));
 doc.classList.toggle("cv-dark",prompt.includes("dark"));
}
photoInput.addEventListener("change",()=>{
 const file=photoInput.files?.[0];if(!file)return;
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>3*1024*1024){say("JPG, PNG ya WebP photo 3 MB se kam upload karein.","error");photoInput.value="";return;}
 const reader=new FileReader();reader.onload=()=>{photoData=String(reader.result||"");if(latestData&&latestAi)render();say("Photo added. CV preview update ho gaya.","success");};reader.readAsDataURL(file);
});
applyDesign.addEventListener("click",()=>{applyStyle();say("Aapka CV design prompt apply ho gaya.","success");});
accentInput.addEventListener("input",applyStyle);positionInput.addEventListener("change",applyStyle);
promptInput.addEventListener("change",applyStyle);
form.addEventListener("submit",async event=>{
 event.preventDefault();if(!form.reportValidity())return;
 latestData=Object.fromEntries(new FormData(form).entries());generate.disabled=true;generate.textContent="Creating your CV…";say("AI aapke experience ko professional CV format mein likh raha hai…");
 try{
  const payload={target_role:latestData.target_role,country:latestData.country,experience_years:latestData.experience_years,experience:latestData.experience,education:latestData.education,skills:latestData.skills,languages:latestData.languages,certifications:latestData.certifications};
  const response=await fetch(API+"/api/cv/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"AI CV generate nahi hua.");
  latestAi=data;render();say("Professional CV ready hai. Preview text par tap karke edit karein; phir A4 PDF save karein.","success");
 }catch(error){say(error.message||"Network error. Dobara try karein.","error");}
 finally{generate.disabled=false;generate.textContent="✦ Generate CV with AI";}
});
print.addEventListener("click",()=>{if(latestData&&latestAi)window.print();});
form.addEventListener("reset",()=>{latestData=null;latestAi=null;photoData="";photoInput.value="";print.disabled=true;preview.innerHTML='<div class="cv-empty"><span>✦</span><h3>Your professional CV will appear here</h3><p>Fill your details and select “Generate CV with AI”.</p></div>';say("");});
})();