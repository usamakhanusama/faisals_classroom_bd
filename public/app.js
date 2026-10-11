let csrf=null;
let me=null;
let mode="signup";
let all=[];
let mine=new Set();
let cat="All";

const $=s=>document.querySelector(s);
const grid=$("#courseGrid");
const dash=$("#dashboardGrid");
const dmsg=$("#dashMessage");
const dlg=$("#authDialog");
const order=["SSC","HSC","Admission","Programming","CSE","Web Development"];

async function api(url,o={}){
  const h={...(o.headers||{})};
  if(o.body)h["Content-Type"]="application/json";
  const m=(o.method||"GET").toUpperCase();
  if(csrf&&["POST","PATCH","PUT","DELETE"].includes(m))h["x-csrf-token"]=csrf;
  const r=await fetch(url,{credentials:"same-origin",...o,headers:h});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Something went wrong. Try again.");
  return d;
}

function toast(t,err){
  const e=document.createElement("div");
  e.className="toast"+(err?" err":"");
  e.textContent=t;
  $("#toasts").appendChild(e);
  setTimeout(()=>e.remove(),3200);
}

function tint(c){
  const i=order.indexOf(c);
  return "t"+(i<0?0:i%6);
}

function el(tag,cls,txt){
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(txt!==undefined)e.textContent=txt;
  return e;
}

function facts(){
  const h=all.reduce((a,c)=>a+Number(c.duration_hours||0),0);
  $("#factCourses").textContent=all.length;
  $("#factHours").textContent=h+"h";
  $("#factStages").textContent=new Set(all.map(c=>c.category)).size;
}

function chips(){
  const cs=[...new Set(all.map(c=>c.category))].sort((a,b)=>{
    const x=order.indexOf(a),y=order.indexOf(b);
    return (x<0?99:x)-(y<0?99:y);
  });
  const box=$("#chips");
  box.innerHTML="";
  ["All",...cs].forEach(c=>{
    const b=el("button","chip",c);
    b.type="button";
    b.setAttribute("role","tab");
    b.setAttribute("aria-selected",String(c===cat));
    b.onclick=()=>setCat(c);
    box.appendChild(b);
  });
  document.querySelectorAll("#stops button").forEach(b=>{
    b.classList.toggle("on",b.dataset.cat===cat);
  });
}

function setCat(c){
  cat=c;
  chips();
  courses();
}

function courses(){
  grid.innerHTML="";
  const list=cat==="All"?all:all.filter(c=>c.category===cat);
  if(!list.length){
    grid.appendChild(el("div","none","এই stage-এর course শিগগিরই আসছে।"));
    return;
  }
  list.forEach(c=>{
    const a=el("article","course "+tint(c.category));
    const top=el("div","c-top");
    top.appendChild(el("div","mono",c.category.charAt(0)));
    top.appendChild(el("span","level",c.level));
    const body=el("div","c-body");
    body.appendChild(el("span","c-cat",c.category));
    body.appendChild(el("h3","",c.title));
    body.appendChild(el("p","",c.description));
    const foot=el("div","c-foot");
    foot.appendChild(el("span","hrs",c.duration_hours+" hours"));
    const b=el("button","btn solid");
    b.type="button";
    if(mine.has(c.id)){
      b.textContent="Enrolled ✓";
      b.classList.remove("solid");
      b.classList.add("done");
      b.onclick=()=>{location.hash="dashboard"};
    }else{
      b.textContent="Enroll";
      b.onclick=()=>enroll(c.id,b);
    }
    foot.appendChild(b);
    a.append(top,body,foot);
    grid.appendChild(a);
  });
}

async function loadCourses(){
  const d=await api("/api/courses");
  all=d.courses;
  facts();
  chips();
  courses();
}

async function enroll(id,b){
  if(!me){openAuth("signup");return}
  b.disabled=true;
  try{
    await api(`/api/courses/${id}/enroll`,{method:"POST"});
    await loadDash();
    courses();
    toast("Enrolled! Dashboard-এ progress track করো।");
  }catch(e){
    b.disabled=false;
    toast(e.message,true);
  }
}

async function loadDash(){
  dash.innerHTML="";
  mine=new Set();
  if(!me){
    dmsg.classList.remove("hidden");
    $("#dashSub").textContent="Log in করলে তোমার enrolled course এখানে দেখাবে।";
    dmsg.innerHTML="";
    dmsg.append(el("strong","","এখনো log in করোনি"),el("span","","Account খুলে প্রথম course-এ enroll করো।"));
    const j=el("button","btn solid","Join free");
    j.type="button";
    j.onclick=()=>openAuth("signup");
    dmsg.appendChild(j);
    return;
  }
  const d=await api("/api/dashboard");
  const list=d.enrollments;
  list.forEach(c=>mine.add(c.id));
  if(!list.length){
    dmsg.classList.remove("hidden");
    $("#dashSub").textContent="তোমার classroom এখন ফাঁকা।";
    dmsg.innerHTML="";
    const j=el("a","btn solid","Browse courses");
    j.href="#courses";
    dmsg.append(el("strong","",`স্বাগতম, ${me.name.split(" ")[0]}!`),el("span","","এখনো কোনো course-এ enroll করোনি। একটা বেছে নাও।"),j);
    return;
  }
  dmsg.classList.add("hidden");
  $("#dashSub").textContent=`${list.length}টি course চলছে। Slider টেনে progress আপডেট করো।`;
  list.forEach(c=>{
    const a=el("article","mc");
    const ring=el("div","ring");
    const pc=el("i","",c.progress+"%");
    ring.appendChild(pc);
    ring.style.setProperty("--p",c.progress);
    const info=el("div");
    info.append(el("span","c-cat",c.category),el("h3","",c.title));
    const ctl=el("div","mc-ctl");
    const r=el("input");
    r.type="range";r.min=0;r.max=100;r.value=c.progress;
    r.setAttribute("aria-label","Progress for "+c.title);
    r.oninput=()=>{
      ring.style.setProperty("--p",r.value);
      pc.textContent=r.value+"%";
    };
    const s=el("button","btn solid","Save");
    s.type="button";
    s.onclick=async()=>{
      s.disabled=true;
      try{
        await api(`/api/enrollments/${c.id}/progress`,{method:"PATCH",body:JSON.stringify({progress:Number(r.value)})});
        toast("Progress saved ✓");
      }catch(e){toast(e.message,true)}
      s.disabled=false;
    };
    ctl.append(r,s);
    a.append(ring,info,ctl);
    dash.appendChild(a);
  });
}

async function loadMe(){
  const d=await api("/api/me");
  me=d.user;
  $("#loginBtn").classList.toggle("hidden",!!me);
  $("#signupBtn").classList.toggle("hidden",!!me);
  $("#logoutBtn").classList.toggle("hidden",!me);
  $("#ctaBand").parentElement.classList.toggle("hidden",!!me);
  $("#adminLink").classList.toggle("hidden",!(me&&me.role==="admin"));
  const u=$("#userChip");
  u.classList.toggle("hidden",!me);
  u.textContent=me?me.name:"";
  await loadDash();
  if(all.length)courses();
}

function openAuth(m){
  mode=m;
  const s=m==="signup";
  $("#nameWrap").classList.toggle("hidden",!s);
  $("#nameInput").required=s;
  $("#passwordHint").classList.toggle("hidden",!s);
  $("#passwordInput").autocomplete=s?"new-password":"current-password";
  $("#authTitle").textContent=s?"Join Faisal’s Classroom":"Welcome back";
  $("#authSub").textContent=s?"Free account খুলে course শুরু করো।":"Log in করে তোমার classroom-এ ফিরে এসো।";
  $("#authSubmit").textContent=s?"Create account":"Log in";
  $("#switchText").textContent=s?"আগে থেকেই account আছে?":"নতুন এসেছ?";
  $("#switchMode").textContent=s?"Log in":"Create account";
  $("#authStatus").textContent="";
  if(!dlg.open)dlg.showModal();
  setTimeout(()=>(s?$("#nameInput"):$("#emailInput")).focus(),30);
}

$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const st=$("#authStatus");
  const sb=$("#authSubmit");
  st.className="status";
  st.textContent="";
  const p={email:$("#emailInput").value.trim(),password:$("#passwordInput").value};
  if(mode==="signup")p.name=$("#nameInput").value.trim();
  if(!p.email||!p.password||(mode==="signup"&&!p.name)){
    st.textContent="সব ঘর পূরণ করো।";
    return;
  }
  sb.disabled=true;
  try{
    const d=await api(mode==="signup"?"/api/auth/register":"/api/auth/login",{method:"POST",body:JSON.stringify(p)});
    me=d.user;
    csrf=d.csrfToken;
    dlg.close();
    $("#authForm").reset();
    await loadMe();
    toast(mode==="signup"?"Account তৈরি হয়েছে। স্বাগতম!":"স্বাগতম ফিরে আসার জন্য!");
  }catch(err){
    st.textContent=err.message;
  }
  sb.disabled=false;
});

$("#switchMode").onclick=()=>openAuth(mode==="signup"?"login":"signup");
$("#pwToggle").onclick=()=>{
  const i=$("#passwordInput");
  const h=i.type==="password";
  i.type=h?"text":"password";
  $("#pwToggle").textContent=h?"Hide":"Show";
};
$("#closeDialog").onclick=()=>dlg.close();
dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close()});
$("#loginBtn").onclick=()=>openAuth("login");
$("#signupBtn").onclick=()=>openAuth("signup");
$("#ctaJoin").onclick=()=>openAuth("signup");
$("#heroStart").onclick=()=>{
  if(me)location.hash="courses";
  else openAuth("signup");
};
$("#logoutBtn").onclick=async()=>{
  try{
    await api("/api/auth/logout",{method:"POST"});
    me=null;
    csrf=(await api("/api/csrf")).csrfToken;
    await loadMe();
    toast("Logged out");
  }catch(e){toast(e.message,true)}
};

document.querySelectorAll("#stops button").forEach(b=>{
  b.onclick=()=>{
    setCat(cat===b.dataset.cat?"All":b.dataset.cat);
    $("#courses").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  };
});

const mb=$("#menuBtn");
const nl=$("#navLinks");
mb.onclick=()=>{
  const o=nl.classList.toggle("open");
  mb.setAttribute("aria-expanded",String(o));
};
nl.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{
  nl.classList.remove("open");
  mb.setAttribute("aria-expanded","false");
}));

(async()=>{
  try{
    csrf=(await api("/api/csrf")).csrfToken;
    await loadCourses();
    await loadMe();
  }catch(e){
    console.error(e);
    grid.innerHTML="";
    grid.appendChild(el("div","none","Course load করা যায়নি। Page refresh করে আবার চেষ্টা করো।"));
  }
})();
