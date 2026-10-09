const STORAGE_KEY = "talentEngineCandidates_v1";
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let candidates = [];
let toastTimer;

function loadCandidates(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []}catch{return []}}
function saveCandidates(){localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates))}
function esc(v=""){return String(v).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
function initials(n=""){return n.trim().split(/\s+/).slice(0,2).map(p=>p[0]||"").join("").toUpperCase()}
function getScore(c){return Number(c.educationScore)+Number(c.skillsScore)+Number(c.experienceScore)+Number(c.fitScore)+Number(c.motivationScore)}
function statusFor(s){if(s>=80)return "Priorité élevée";if(s>=60)return "À examiner";if(s>=40)return "Examen complémentaire";return "Faible correspondance"}
function statusClass(s){if(s>=80)return "high";if(s>=60)return "medium";if(s>=40)return "low";return "weak"}
function formatDate(d){return new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"})}
function shortDate(d){return new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})}
function showToast(msg){const el=$("#toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2800)}
function scoreMarkup(c){const s=getScore(c);return `<div><span class="score-number">${s}/100</span><div class="score-bar"><span style="width:${s}%"></span></div></div>`}
function badgeMarkup(c){const s=getScore(c);return `<span class="badge ${statusClass(s)}">${statusFor(s)}</span>`}
function candidateCell(c){return `<div class="candidate-cell"><div class="avatar">${esc(initials(c.name))}</div><div><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></div></div>`}

function renderDashboard(){
 const total=candidates.length, priority=candidates.filter(c=>getScore(c)>=80).length, review=candidates.filter(c=>getScore(c)>=60&&getScore(c)<80).length;
 const avg=total?Math.round(candidates.reduce((sum,c)=>sum+getScore(c),0)/total):null;
 if($("#totalStat")) $("#totalStat").textContent=total;
 if($("#priorityStat")) $("#priorityStat").textContent=priority;
 if($("#reviewStat")) $("#reviewStat").textContent=review;
 if($("#averageStat")) $("#averageStat").textContent=avg===null?"—":`${avg}/100`;
 if($("#navCount")) $("#navCount").textContent=total;
 if($("#priorityTable")){
   const ranked=[...candidates].sort((a,b)=>getScore(b)-getScore(a)).slice(0,5);
   $("#priorityTable").innerHTML=ranked.map(c=>`<tr><td>${candidateCell(c)}</td><td>${esc(c.job)}</td><td>${scoreMarkup(c)}</td><td>${badgeMarkup(c)}</td><td><button class="row-action" data-detail="${c.id}">Voir</button></td></tr>`).join("");
   $("#emptyDashboard").classList.toggle("hidden",total!==0);
   $(".candidate-panel .table-wrap").classList.toggle("hidden",total===0);
   $("#recentList").innerHTML=[...candidates].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,4).map(c=>`<div class="recent-item"><div class="avatar">${esc(initials(c.name))}</div><div class="recent-meta"><strong>${esc(c.name)}</strong><small>${esc(c.job)} · ${shortDate(c.createdAt)}</small></div><div class="recent-score">${getScore(c)}/100</div>${badgeMarkup(c)}</div>`).join("")||`<div class="recent-item"><div class="recent-meta"><strong>Aucune activité pour le moment</strong><small>Les nouvelles candidatures apparaîtront ici.</small></div></div>`;
 }
}
function renderCandidates(){
 if(!$("#candidatesTable"))return;
 const query=$("#searchInput").value.trim().toLowerCase(), status=$("#statusFilter").value, job=$("#jobFilter").value, sort=$("#sortFilter").value;
 let rows=candidates.filter(c=>(!query||[c.name,c.email,c.phone,c.job,c.skills].join(" ").toLowerCase().includes(query))&&(!status||statusFor(getScore(c))===status)&&(!job||c.job===job));
 if(sort==="score")rows.sort((a,b)=>getScore(b)-getScore(a));else if(sort==="newest")rows.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));else rows.sort((a,b)=>a.name.localeCompare(b.name,"fr"));
 $("#candidatesTable").innerHTML=rows.map(c=>`<tr><td>${candidateCell(c)}</td><td>${esc(c.job)}</td><td>${esc(c.educationLabel)}</td><td>${esc(c.experienceLabel)}</td><td>${scoreMarkup(c)}</td><td>${badgeMarkup(c)}</td><td><button class="row-action" data-detail="${c.id}">Détails</button></td></tr>`).join("");
 $("#candidateEmpty").classList.toggle("hidden",rows.length!==0);$(".full-table").classList.toggle("hidden",rows.length===0);
 $("#resultCount").textContent=`${rows.length} candidat${rows.length>1?"s":""} affiché${rows.length>1?"s":""}`;
 const jobs=[...new Set(candidates.map(c=>c.job).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fr")), prev=$("#jobFilter").value;
 $("#jobFilter").innerHTML='<option value="">Tous les postes</option>'+jobs.map(j=>`<option value="${esc(j)}">${esc(j)}</option>`).join("");
 if(jobs.includes(prev))$("#jobFilter").value=prev;
}
function updateLiveScore(){
 const names=["educationScore","skillsScore","experienceScore","fitScore","motivationScore"];
 const total=names.reduce((sum,n)=>sum+Math.max(0,Number($(`[name="${n}"]`)?.value||0)),0);
 if($("#liveScore"))$("#liveScore").innerHTML=`${total}<span>/100</span>`;
 if($("#liveStatus")){$("#liveStatus").textContent=statusFor(total);$("#liveStatus").style.color=total>=80?"#18875b":total>=60?"#b96c16":total>=40?"#3e7bb6":"#b94752"}
}
function openDetails(id){
 const c=candidates.find(x=>x.id===id);if(!c||!$("#modalContent"))return;const score=getScore(c);
 $("#modalContent").innerHTML=`<div class="detail-header"><div class="avatar">${esc(initials(c.name))}</div><div><h2 id="modalTitle">${esc(c.name)}</h2><p>${esc(c.job)} · Candidature du ${formatDate(c.createdAt)}${c.createdByName?` · ajoutée par ${esc(c.createdByName)}`:""}</p></div><div class="detail-score"><strong>${score}<small>/100</small></strong>${badgeMarkup(c)}</div></div>
 <div class="detail-section"><h4>Coordonnées</h4><div class="detail-grid"><div class="detail-field"><small>E-mail</small><strong>${esc(c.email)}</strong></div><div class="detail-field"><small>Téléphone</small><strong>${esc(c.phone||"Non renseigné")}</strong></div><div class="detail-field"><small>Formation</small><strong>${esc(c.educationLabel)}</strong></div><div class="detail-field"><small>Expérience</small><strong>${esc(c.experienceLabel)}</strong></div></div></div>
 <div class="detail-section"><h4>Compétences et motivation</h4><div class="detail-field"><small>Compétences</small><p>${esc(c.skills)}</p></div><div class="detail-field" style="margin-top:13px"><small>Résumé / motivation</small><p>${esc(c.motivation||"Non renseigné")}</p></div></div>
 <div class="detail-section"><h4>Détail du score</h4>${[["Formation pertinente",c.educationScore,20],["Compétences techniques",c.skillsScore,30],["Expérience",c.experienceScore,20],["Correspondance au poste",c.fitScore,20],["Motivation",c.motivationScore,10]].map(([l,v,m])=>`<div class="breakdown-row"><span>${l} <small>(${m} pts max.)</small></span><strong>${v}/${m}</strong></div>`).join("")}<div class="breakdown-row" style="border-top:1px solid #edf0f5;margin-top:5px;padding-top:12px"><strong>Score total</strong><strong>${score}/100</strong></div></div>
 <div class="detail-actions">${TE.canDelete(c)?`<button class="danger-btn" data-delete="${c.id}">Supprimer</button>`:""}<button class="primary-btn" data-close-modal>Fermer</button></div>`;
 $("#detailModal").classList.remove("hidden");
}
function closeModal(){if($("#detailModal"))$("#detailModal").classList.add("hidden")}
async function deleteCandidate(id){const c=candidates.find(x=>x.id===id);if(!c||!confirm(`Supprimer la candidature de ${c.name} ?`))return;try{await TE.removeCandidate(id)}catch(e){showToast(TE.errMsg(e));return}candidates=candidates.filter(x=>x.id!==id);closeModal();renderDashboard();renderCandidates();showToast("Candidature supprimée.")}
function exportCSV(){
 if(!candidates.length){showToast("Aucune candidature à exporter.");return}
 const headers=["Nom","E-mail","Téléphone","Poste","Formation","Expérience","Compétences","Motivation","Formation (points)","Compétences (points)","Expérience (points)","Correspondance (points)","Motivation (points)","Score total","Statut","Date"];
 const escCSV=v=>`"${String(v??"").replace(/"/g,'""')}"`;
 const lines=candidates.map(c=>[c.name,c.email,c.phone,c.job,c.educationLabel,c.experienceLabel,c.skills,c.motivation,c.educationScore,c.skillsScore,c.experienceScore,c.fitScore,c.motivationScore,getScore(c),statusFor(getScore(c)),formatDate(c.createdAt)].map(escCSV).join(";"));
 const blob=new Blob(["\ufeff"+[headers.map(escCSV).join(";"),...lines].join("\r\n")],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="talent-engine-candidatures.csv";a.click();URL.revokeObjectURL(url);showToast("Export CSV téléchargé.");
}
async function loadDemo(){
 if(candidates.length&&!confirm("Ajouter les candidats de démonstration à la liste existante ?"))return;
 const samples=[
 {name:"Amina Kabeya",email:"amina.kabeya@example.com",phone:"+243 812 000 101",job:"Développeuse web",educationLabel:"Licence / Bac+4 ou Bac+5",education:"17",experienceLabel:"3 à 4 ans",experience:"15",skills:"HTML, CSS, JavaScript, Git, résolution de problèmes",motivation:"Je souhaite contribuer à des produits utiles et progresser au sein d'une équipe.",educationScore:18,skillsScore:28,experienceScore:16,fitScore:18,motivationScore:9},
 {name:"Patrick Mbuyi",email:"patrick.mbuyi@example.com",phone:"+243 812 000 102",job:"Informaticien",educationLabel:"Graduat / Bac+3",education:"14",experienceLabel:"1 à 2 ans",experience:"10",skills:"Support informatique, Windows, réseaux, Microsoft Office",motivation:"Je suis motivé à résoudre les problèmes techniques des utilisateurs.",educationScore:16,skillsScore:23,experienceScore:12,fitScore:17,motivationScore:8},
 {name:"Grâce Ilunga",email:"grace.ilunga@example.com",phone:"+243 812 000 103",job:"Assistante administrative",educationLabel:"Master ou plus",education:"20",experienceLabel:"Moins d'un an",experience:"5",skills:"Excel, rédaction, organisation, communication, classement",motivation:"Je souhaite mettre mon sens de l'organisation au service de votre équipe.",educationScore:19,skillsScore:22,experienceScore:7,fitScore:16,motivationScore:9},
 {name:"David Nsimba",email:"david.nsimba@example.com",phone:"+243 812 000 104",job:"Développeur web",educationLabel:"Secondaire / diplôme d'État",education:"10",experienceLabel:"Aucune expérience",experience:"0",skills:"HTML, CSS, initiation JavaScript",motivation:"Je suis autodidacte et souhaite apprendre en travaillant sur des projets réels.",educationScore:11,skillsScore:17,experienceScore:3,fitScore:13,motivationScore:8},
 {name:"Sarah Banza",email:"sarah.banza@example.com",phone:"+243 812 000 105",job:"Chargée de communication",educationLabel:"Licence / Bac+4 ou Bac+5",education:"17",experienceLabel:"5 ans ou plus",experience:"20",skills:"Réseaux sociaux, rédaction, stratégie de contenu, analyse, Canva",motivation:"Je peux structurer une communication cohérente et mesurer ses résultats.",educationScore:18,skillsScore:27,experienceScore:18,fitScore:19,motivationScore:9}
 ];
 const now=Date.now();const rows=samples.map((s,i)=>({...s,createdAt:new Date(now-i*3600000).toISOString()}));try{await TE.addMany(rows);candidates=await TE.fetchCandidates()}catch(e){showToast(TE.errMsg(e));return}
 renderDashboard();renderCandidates();showToast("Candidats de démonstration ajoutés.");
}
function initForm(){
 const form=$("#candidateForm");if(!form)return;
 form.addEventListener("input",e=>{if(e.target.matches('[name$="Score"]'))updateLiveScore()});
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(!form.reportValidity())return;const d=new FormData(form),get=n=>String(d.get(n)||"").trim();
  const edu={"10":"Secondaire / diplôme d'État","14":"Graduat / Bac+3","17":"Licence / Bac+4 ou Bac+5","20":"Master ou plus"},exp={"0":"Aucune expérience","5":"Moins d'un an","10":"1 à 2 ans","15":"3 à 4 ans","20":"5 ans ou plus"};
  const c={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:get("name"),email:get("email"),phone:get("phone"),job:get("job"),education:get("education"),educationLabel:edu[get("education")]||"Non renseigné",experience:get("experience"),experienceLabel:exp[get("experience")]||"Non renseigné",skills:get("skills"),motivation:get("motivation"),educationScore:Number(get("educationScore")),skillsScore:Number(get("skillsScore")),experienceScore:Number(get("experienceScore")),fitScore:Number(get("fitScore")),motivationScore:Number(get("motivationScore")),createdAt:new Date().toISOString()};
  if([c.educationScore,c.skillsScore,c.experienceScore,c.fitScore,c.motivationScore].some(n=>!Number.isFinite(n)||n<0)||c.educationScore>20||c.skillsScore>30||c.experienceScore>20||c.fitScore>20||c.motivationScore>10){showToast("Vérifiez les points attribués à chaque critère.");return}
  try{await TE.addCandidate(c)}catch(err){showToast(TE.errMsg(err));return}form.reset();["educationScore","skillsScore","experienceScore","fitScore","motivationScore"].forEach((n,i)=>form.elements[n].value=[15,20,10,15,7][i]);updateLiveScore();
  showToast("Candidature enregistrée. Le tableau de bord sera actualisé.");
  setTimeout(()=>window.location.href="index.html?nouvelle=1",650);
 });
 const cancel=$("#cancelFormBtn");if(cancel)cancel.addEventListener("click",()=>window.location.href="index.html");
 updateLiveScore();
}
document.addEventListener("click",e=>{
 const detail=e.target.closest("[data-detail]");if(detail)openDetails(detail.dataset.detail);
 const del=e.target.closest("[data-delete]");if(del)deleteCandidate(del.dataset.delete);
 if(e.target.closest("[data-close-modal]"))closeModal();
 if(e.target.closest("#seeAllBtn"))window.location.href="candidatures.html";
 if(e.target.closest("#emptyAddBtn"))window.location.href="formulaire.html";
 if(e.target.closest("#topAddBtn"))window.location.href="formulaire.html";
 if(e.target.closest("#demoBtn"))loadDemo();
 if(e.target.closest("#exportBtn"))exportCSV();
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
["searchInput","statusFilter","jobFilter","sortFilter"].forEach(id=>{const el=$("#"+id);if(el)el.addEventListener(id==="searchInput"?"input":"change",renderCandidates)});
if($("#todayLabel"))$("#todayLabel").textContent=new Date().toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"long",year:"numeric"});
(async()=>{try{await TE.init();if(TE.redirecting)return;candidates=await TE.fetchCandidates()}catch(e){candidates=[];showToast(TE.errMsg(e))}initForm();renderDashboard();renderCandidates();TE.decorateShell()})();
if(new URLSearchParams(location.search).has("nouvelle"))showToast("Nouvelle candidature reçue et affichée dans le tableau de bord.");
