/* Talent Engine — couche données : mode local (navigateur) ou base Supabase partagée */
(function () {
  "use strict";
  const LS_CFG = "te_config", LS_DATA = "talentEngineCandidates_v1";
  const base = window.TE_CONFIG || {};
  let ov = {}; try { ov = JSON.parse(localStorage.getItem(LS_CFG)) || {}; } catch (e) {}
  const cfg = { url: String(ov.url || base.SUPABASE_URL || "").trim(), key: String(ov.key || base.SUPABASE_ANON_KEY || "").trim() };
  const configured = !!(cfg.url && cfg.key);
  const cloud = configured && !!window.supabase;
  const page = location.pathname.split("/").pop() || "index.html";
  const PUBLIC_PAGES = ["login.html", "base-de-donnees.html", "postuler.html"];
  const ROLE = { admin: "Administrateur", recruteur: "Recruteur", lecteur: "Lecteur", en_attente: "En attente" };
  const TE = window.TE = { cfg, configured, cloud, sdkMissing: configured && !window.supabase, page, ROLE,
    session: null, profile: null, client: null, pending: false, redirecting: false };
  if (cloud) TE.client = window.supabase.createClient(cfg.url, cfg.key);

  TE.esc = (v = "") => String(v).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const esc = TE.esc;

  const MSG = { "Invalid login credentials": "E-mail ou mot de passe incorrect.", "User already registered": "Un compte existe déjà avec cet e-mail.",
    "Email not confirmed": "E-mail non confirmé : vérifiez votre boîte de réception.", "Failed to fetch": "Connexion à la base impossible. Vérifiez l'URL et votre connexion Internet." };
  TE.errMsg = e => {
    const m = (e && e.message) || String(e);
    for (const k in MSG) if (m.includes(k)) return MSG[k];
    if (/Password should be/i.test(m)) return "Mot de passe trop court (6 caractères minimum).";
    if (/Object not found|not found/i.test(m)) return "Fichier introuvable (déjà supprimé ?).";
    if (/row-level security|permission denied/i.test(m)) return "Action refusée : votre rôle ne le permet pas.";
    if (/does not exist|schema cache/i.test(m)) return "Tables introuvables : exécutez supabase-schema.sql dans Supabase.";
    return m;
  };

  /* ---------- Correspondance objet JS <-> ligne SQL ---------- */
  const toRow = c => ({ name: c.name, email: c.email, phone: c.phone || null, job: c.job, education: c.education || null,
    education_label: c.educationLabel || null, experience: c.experience || null, experience_label: c.experienceLabel || null,
    skills: c.skills || "", motivation: c.motivation || null, cv_path: c.cvPath || null, cv_name: c.cvName || null, education_score: Number(c.educationScore) || 0, skills_score: Number(c.skillsScore) || 0,
    experience_score: Number(c.experienceScore) || 0, fit_score: Number(c.fitScore) || 0, motivation_score: Number(c.motivationScore) || 0 });
  const fromRow = r => ({ id: r.id, name: r.name, email: r.email, phone: r.phone || "", job: r.job, education: r.education,
    educationLabel: r.education_label || "Non renseigné", experience: r.experience, experienceLabel: r.experience_label || "Non renseigné",
    skills: r.skills || "", motivation: r.motivation || "", educationScore: r.education_score, skillsScore: r.skills_score,
    experienceScore: r.experience_score, fitScore: r.fit_score, motivationScore: r.motivation_score, createdAt: r.created_at,
    cvPath: r.cv_path || "", cvName: r.cv_name || "", createdBy: r.created_by, createdByName: (r.profiles && (r.profiles.full_name || r.profiles.email)) || "" });

  /* ---------- Stockage local ---------- */
  TE.loadLocal = () => { try { return JSON.parse(localStorage.getItem(LS_DATA)) || []; } catch (e) { return []; } };
  TE.saveLocal = a => localStorage.setItem(LS_DATA, JSON.stringify(a));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

  /* ---------- Données (mode local ou cloud, même interface) ---------- */
  TE.fetchCandidates = async () => {
    if (!cloud) return TE.loadLocal();
    const { data, error } = await TE.client.from("candidates").select("*, profiles(full_name,email)").order("created_at", { ascending: false });
    if (error) throw error;
    return data.map(fromRow);
  };
  TE.addMany = async rows => {
    if (!cloud) { const a = TE.loadLocal(); const now = Date.now();
      rows.forEach((c, i) => a.push({ ...c, id: uid(), createdAt: c.createdAt || new Date(now - i * 1000).toISOString() })); TE.saveLocal(a); return; }
    const { error } = await TE.client.from("candidates").insert(rows.map(toRow));
    if (error) throw error;
  };
  TE.addCandidate = c => TE.addMany([c]);
  TE.removeCandidate = async id => {
    if (!cloud) { TE.saveLocal(TE.loadLocal().filter(x => x.id !== id)); return; }
    const pre = await TE.client.from("candidates").select("cv_path").eq("id", id).maybeSingle();
    const { data, error } = await TE.client.from("candidates").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || !data.length) throw new Error("row-level security : suppression refusée");
    if (pre.data && pre.data.cv_path) { try { await TE.client.storage.from("cvs").remove([pre.data.cv_path]); } catch (e) {} }
  };
  TE.removeCv = async path => { if (cloud && path) { try { await TE.client.storage.from("cvs").remove([path]); } catch (e) {} } };
  TE.openCv = async path => {
    const w = window.open("", "_blank");
    try {
      const { data, error } = await TE.client.storage.from("cvs").createSignedUrl(path, 300);
      if (error) throw error;
      if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
    } catch (e) { if (w) w.close(); throw e; }
  };

  /* ---------- Notation automatique (règles transparentes, le recruteur reste décisionnaire) ---------- */
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#.\s]/g, " ").replace(/\.(?=\s|$)/g, " ").replace(/(^|\s)\./g, "$1 ").replace(/\s+/g, " ").trim();
  const items = s => String(s || "").split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  const hasTerm = (text, term) => {
    const t = norm(term); if (!t) return false;
    return new RegExp("(^|\\s)" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(s)?(?=\\s|$)").test(text);
  };
  const hit = (item, text) => item.split("|").some(a => hasTerm(text, a));
  const label = i => i.split("|")[0].trim();
  const ratioScore = (cand, req, max) => !req ? Math.min(max, cand) : (cand >= req ? max : Math.round(max * cand / req));
  TE.autoScore = (app, job) => {
    const skillsTxt = norm(app.skills), allTxt = norm((app.skills || "") + " " + (app.motivation || ""));
    const req = items(job.required_skills), bonus = items(job.bonus_skills);
    const reqHit = req.filter(i => hit(i, skillsTxt)), reqMiss = req.filter(i => !hit(i, skillsTxt));
    const everything = req.concat(bonus), everythingHit = everything.filter(i => hit(i, allTxt));
    const ed = Number(app.education) || 0, ex = Number(app.experience) || 0;
    const scores = {
      educationScore: ratioScore(ed, Number(job.min_education) || 0, 20),
      skillsScore: req.length ? Math.round(30 * reqHit.length / req.length) : 20,
      experienceScore: ratioScore(ex, Number(job.min_experience) || 0, 20),
      fitScore: everything.length ? Math.round(20 * everythingHit.length / everything.length) : 15,
      motivationScore: 5
    };
    return { scores, details: { reqHit: reqHit.map(label), reqMiss: reqMiss.map(label), bonusHit: bonus.filter(i => hit(i, allTxt)).map(label), hasCriteria: req.length > 0 } };
  };

  /* ---------- Rôles ---------- */
  TE.role = () => cloud ? ((TE.profile && TE.profile.role) || "en_attente") : "admin";
  TE.isAdmin = () => TE.role() === "admin";
  TE.canWrite = () => ["admin", "recruteur"].includes(TE.role());
  TE.canDelete = c => TE.role() === "admin" || (TE.role() === "recruteur" && (!cloud || (TE.session && c.createdBy === TE.session.user.id)));

  /* ---------- Authentification ---------- */
  TE.signIn = (email, password) => TE.client.auth.signInWithPassword({ email, password });
  TE.signUp = (email, password, full_name) => TE.client.auth.signUp({ email, password, options: { data: { full_name } } });
  TE.signOut = async () => { try { if (TE.client) await TE.client.auth.signOut(); } catch (e) {} location.href = "login.html"; };

  TE.init = async () => {
    if (!cloud) return;
    const { data } = await TE.client.auth.getSession();
    TE.session = data.session;
    if (!TE.session) { if (!PUBLIC_PAGES.includes(page)) { TE.redirecting = true; location.replace("login.html"); } return; }
    const r = await TE.client.from("profiles").select("*").eq("id", TE.session.user.id).maybeSingle();
    TE.profile = r.data || null;
    TE.pending = !TE.profile || TE.profile.role === "en_attente";
  };

  /* ---------- Interface commune ---------- */
  function overlay() {
    if (document.querySelector(".te-overlay")) return;
    const o = document.createElement("div"); o.className = "te-overlay";
    o.innerHTML = '<div class="box"><h2>Compte en attente</h2><p>Votre compte est créé. Un administrateur doit l\'approuver avant que vous puissiez accéder aux candidatures.</p><button class="primary-btn" id="ovOut">Se déconnecter</button></div>';
    document.body.appendChild(o); o.querySelector("#ovOut").onclick = TE.signOut;
  }
  TE.decorateShell = function () {
    const nav = document.querySelector(".side-nav");
    const add = (href, icon, label, show) => {
      if (!nav || !show || nav.querySelector('a[href="' + href + '"]')) return;
      const a = document.createElement("a"); a.className = "nav-item" + (page === href ? " active" : ""); a.href = href;
      a.innerHTML = "<span>" + icon + "</span> " + label; nav.appendChild(a);
    };
    add("candidatures-recues.html", "✉", "Candidatures reçues", cloud && TE.canWrite());
    add("postes.html", "▤", "Postes", cloud && TE.canWrite());
    add("utilisateurs.html", "☰", "Utilisateurs", cloud && TE.isAdmin());
    add("base-de-donnees.html", "⛁", "Base de données", !cloud || TE.isAdmin());
    const bottom = document.querySelector(".sidebar-bottom");
    if (bottom && !document.querySelector(".user-card")) {
      const d = document.createElement("div"); d.className = "user-card";
      if (cloud && TE.session) {
        d.innerHTML = "<strong>" + esc((TE.profile && TE.profile.full_name) || TE.session.user.email) + "</strong><small>" + esc(ROLE[TE.role()] || "") + '</small><button type="button" id="logoutBtn">Se déconnecter</button>';
      } else {
        d.innerHTML = '<strong>Mode local</strong><small>Données stockées dans ce navigateur</small><a href="base-de-donnees.html">Configurer la base de données</a>';
      }
      bottom.parentNode.insertBefore(d, bottom);
      const lb = d.querySelector("#logoutBtn"); if (lb) lb.onclick = TE.signOut;
    }
    const v = document.querySelector(".version"); if (v) v.textContent = cloud ? "Multi-utilisateurs · Base de données" : "Prototype multipage · Stockage local";
    document.querySelectorAll(".status-pill").forEach(p => { p.innerHTML = "<i></i> " + (cloud ? "Base connectée" : "Mode local"); });
    const f = document.querySelector(".app-footer span:last-child");
    if (f) f.textContent = cloud ? "Les données sont stockées dans la base de données partagée." : "Les données sont conservées dans ce navigateur.";
    const h = document.querySelector(".welcome-row h2");
    if (h && cloud && TE.session) h.textContent = "Bonjour, " + ((TE.profile && TE.profile.full_name) || "recruteur") + " 👋";
    if (!TE.canWrite()) {
      document.querySelectorAll('a[href="formulaire.html"],#topAddBtn,#emptyAddBtn,#demoBtn').forEach(el => { el.style.display = "none"; });
      const av = document.getElementById("addView");
      if (av) av.innerHTML = '<div class="panel form-panel"><h3>Lecture seule</h3><p>Votre rôle ne permet pas d\'ajouter des candidatures.</p></div>';
    }
    if (cloud && TE.session && TE.pending) overlay();
  };

  /* ---------- Styles additionnels (connexion, carte utilisateur, mobile) ---------- */
  const s = document.createElement("style");
  s.textContent = [
    ".user-card{margin-top:auto;margin-bottom:14px;background:#1b2740;border:1px solid #293550;border-radius:13px;padding:12px 14px;color:#fff;font-size:11px}",
    ".user-card+.sidebar-bottom{margin-top:0}.user-card strong{display:block;font-size:12px;overflow-wrap:anywhere}.user-card small{display:block;color:#a7b2c6;margin:3px 0 10px}",
    ".user-card button,.user-card a{display:inline-block;border:1px solid #3a4866;background:transparent;color:#cfd7e6;border-radius:8px;padding:7px 10px;font-size:11px;text-decoration:none;cursor:pointer}",
    ".te-overlay{position:fixed;inset:0;z-index:100;background:#111a2ef2;display:grid;place-items:center;padding:20px}",
    ".te-overlay .box{background:#fff;border-radius:16px;padding:28px;max-width:420px;text-align:center}.te-overlay h2{font-family:Manrope,sans-serif;margin:0 0 10px}.te-overlay p{color:#687389;line-height:1.6;margin:0 0 18px}",
    ".auth-body{min-height:100vh;display:grid;place-items:center;padding:18px}.auth-card{width:min(420px,100%);background:#fff;border:1px solid #e9ecf3;border-radius:16px;padding:28px;box-shadow:0 10px 40px #1118271a}",
    ".auth-card .brand-mark{margin:0 auto 12px;color:#fff}.auth-card h1{font-family:Manrope,sans-serif;font-size:21px;text-align:center;margin:0 0 4px}.auth-sub{text-align:center;color:#8b95a6;font-size:12px;margin:0 0 20px}",
    ".auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#f3f4f8;padding:4px;border-radius:10px;margin-bottom:18px}.auth-tabs button{border:0;background:transparent;border-radius:8px;padding:9px;font-weight:700;font-size:12px;color:#6f7889}.auth-tabs button.active{background:#fff;color:#584bd0;box-shadow:0 1px 4px #0001}",
    ".auth-card form{display:grid;gap:14px}.auth-card label{display:flex;flex-direction:column;gap:7px;font-size:11px;font-weight:700;color:#4b566d}.auth-card input,.cfg-input{width:100%;border:1px solid #e1e5ed;border-radius:8px;padding:11px 12px;font-size:13px;outline:0}",
    ".auth-card .primary-btn{padding:13px;font-size:13px}.auth-msg{font-size:12px;min-height:18px;margin:12px 0 0;color:#b94752;text-align:center}.auth-msg.ok{color:#18875b}.auth-hint{font-size:10px;color:#9aa2b1;line-height:1.6;text-align:center;margin:10px 0 0}",
    ".auth-notice{background:#fff7e8;border:1px solid #f3dcae;color:#8a5a14;border-radius:10px;padding:12px;font-size:12px;line-height:1.6;margin-bottom:16px}",
    ".db-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.db-pre{background:#0f172a;color:#cbd5e1;border-radius:10px;padding:14px;font-size:11px;line-height:1.6;max-height:260px;overflow:auto;white-space:pre;margin:12px 0}",
    ".steps{margin:0;padding-left:18px;line-height:1.9;color:#4b566d;font-size:12px}.role-select{border:1px solid #e1e5ed;border-radius:8px;padding:8px 10px;font-size:12px;background:#fff}",
    "@media(max-width:860px){.app-shell{flex-direction:column}.sidebar{width:100%;min-height:0;padding:14px}.brand{padding-bottom:12px}.workspace-label{display:none}",
    ".side-nav{display:flex;overflow-x:auto;gap:6px;padding-bottom:4px}.nav-item{white-space:nowrap;padding:10px 12px;flex-shrink:0}.sidebar-bottom{display:none}.user-card{margin:12px 0 0}",
    ".main-content{padding:0 14px 16px}.topbar{flex-wrap:wrap;padding:14px 0;min-height:0}.topbar-actions{flex-wrap:wrap;gap:10px}",
    ".stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.content-grid{grid-template-columns:1fr}.form-grid,.score-fields,.detail-grid{grid-template-columns:1fr}.span-two{grid-column:auto}",
    ".welcome-row,.section-intro{flex-wrap:wrap}.app-footer{flex-direction:column}}"
  ].join("\n");
  document.head.appendChild(s);
})();
