let csrf="";
let me=null;
let cur="overview";
const $=s=>document.querySelector(s);
const names={overview:"Overview",courses:"Courses",users:"Students",enr:"Enrollments",log:"Activity"};
const levels=["Beginner","Intermediate","Advanced"];

function el(t,c,x){
  const e=document.createElement(t);
  if(c)e.className=c;
  if(x!==undefined)e.textContent=x;
  return e;
}

function btn(t,c,f){
  const b=el("button","btn "+c,t);
  b.type="button";
  if(f)b.onclick=f;
  return b;
}

async function api(u,o={}){
  const h={};
  if(o.body)h["Content-Type"]="application/json";
  const m=(o.method||"GET").toUpperCase();
  if(csrf&&m!=="GET")h["x-csrf-token"]=csrf;
  const r=await fetch(u,{credentials:"same-origin",...o,headers:h});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
    const e=new Error(d.error||"Something went wrong");
    e.status=r.status;
    throw e;
  }
  return d;
}

function toast(t,bad){
  const e=el("div","toast"+(bad?" bad":""),t);
  $("#toasts").appendChild(e);
  setTimeout(()=>e.remove(),3400);
}

function oops(e){
  if(e.status===401||e.status===403){
    me=null;
    showLogin();
    return;
  }
  toast(e.message,true);
}

function date(x,t){
  const d=new Date(x);
  const o={day:"numeric",month:"short",year:"numeric"};
  if(t){o.hour="2-digit";o.minute="2-digit"}
  return d.toLocaleString("en-GB",o);
}

function ask(t,m,b){
  return new Promise(res=>{
    const d=$("#dAsk");
    $("#aT").textContent=t;
    $("#aM").textContent=m;
    $("#aYes").textContent=b||"Confirm";
    const end=v=>{d.close();res(v)};
    $("#aYes").onclick=()=>end(true);
    $("#aNo").onclick=()=>end(false);
    d.oncancel=()=>res(false);
    d.showModal();
  });
}

function form(title,fields,go,label){
  const f=$("#fForm");
  const d=$("#dForm");
  f.innerHTML="";
  f.appendChild(el("h2","",title));
  const grid=el("div","g2");
  const ins={};
  fields.forEach(x=>{
    const l=el("label");
    l.appendChild(document.createTextNode(x.label));
    let i;
    if(x.type==="select"){
      i=el("select");
      x.opts.forEach(o=>{
        const op=el("option","",o.t);
        op.value=o.v;
        i.appendChild(op);
      });
    }else if(x.type==="area"){
      i=el("textarea");
    }else if(x.type==="check"){
      i=el("input");
      i.type="checkbox";
      l.className="chk";
      l.textContent="";
      l.append(i,document.createTextNode(x.label));
    }else{
      i=el("input");
      i.type=x.type||"text";
      if(x.max)i.maxLength=x.max;
      if(x.min!==undefined)i.min=x.min;
      if(x.ac)i.autocomplete=x.ac;
    }
    if(x.type==="check")i.checked=!!x.val;
    else if(x.val!==undefined)i.value=x.val;
    if(x.ph)i.placeholder=x.ph;
    ins[x.k]=i;
    if(x.type!=="check")l.appendChild(i);
    if(x.wide||x.type==="area"||x.type==="check")l.style.gridColumn="1/-1";
    grid.appendChild(l);
  });
  f.appendChild(grid);
  const er=el("p","err");
  er.setAttribute("role","alert");
  f.appendChild(er);
  const row=el("div","row");
  const sv=btn(label||"Save","solid");
  sv.type="submit";
  row.append(btn("Cancel","line",()=>d.close()),sv);
  f.appendChild(row);
  f.onsubmit=async e=>{
    e.preventDefault();
    er.textContent="";
    const v={};
    for(const k in ins)v[k]=ins[k].type==="checkbox"?ins[k].checked:ins[k].value;
    sv.disabled=true;
    try{
      await go(v);
      d.close();
    }catch(x){
      if(x.status===401||x.status===403){d.close();oops(x)}
      else er.textContent=x.message;
    }
    sv.disabled=false;
  };
  d.showModal();
  const first=f.querySelector("input,select,textarea");
  if(first)first.focus();
  return ins;
}

function table(cols,rows,none){
  const w=el("div","wrapt");
  if(!rows.length){
    w.appendChild(el("div","empty",none||"Nothing here yet."));
    return w;
  }
  const t=el("table");
  const hd=el("tr");
  cols.forEach(c=>hd.appendChild(el("th","",c)));
  const th=el("thead");
  th.appendChild(hd);
  t.appendChild(th);
  const tb=el("tbody");
  rows.forEach(r=>{
    const tr=el("tr");
    r.forEach(c=>{
      const td=el("td");
      if(c instanceof Node)td.appendChild(c);
      else td.textContent=c;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  w.appendChild(t);
  return w;
}

function two(a,b){
  const w=el("div");
  w.append(el("span","",a));
  w.appendChild(el("small","",b));
  return w;
}

function tag(t,c){
  return el("span","tag "+(c||""),t);
}

function pager(d,go){
  const p=el("div","pg");
  const a=btn("Previous","line sm",()=>go(d.page-1));
  const b=btn("Next","line sm",()=>go(d.page+1));
  a.disabled=d.page<=1;
  b.disabled=d.page>=d.pages;
  p.append(el("span","",`Page ${d.page} of ${d.pages} · ${d.total} total`),a,b);
  return p;
}

function debounce(f,ms){
  let t;
  return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)};
}

function slugify(s){
  return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);
}

function setView(v){
  cur=v;
  $("#vTitle").textContent=names[v];
  $("#vAct").innerHTML="";
  $("#view").innerHTML="";
  document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  views[v]();
}

const views={
  async overview(){
    try{
      const s=await api("/api/admin/stats");
      const v=$("#view");
      const st=el("div","stats");
      [
        [s.users,"Total users",`${s.admins} admin${s.admins===1?"":"s"}${s.disabled?` · ${s.disabled} disabled`:""}`],
        [s.courses,"Courses",`${s.published} published`],
        [s.enrollments,"Enrollments",`${s.completed} completed`],
        [s.avg_progress+"%","Average progress",""],
        [s.new_week,"New users this week",""],
        [s.courses-s.published,"Drafts (hidden)",""]
      ].forEach(x=>{
        const c=el("div","stat");
        c.append(el("b","",x[0]),el("span","",x[1]));
        if(x[2])c.appendChild(el("small","",x[2]));
        st.appendChild(c);
      });
      v.appendChild(st);
      const g=el("div","two");
      const c1=el("div","card");
      c1.appendChild(el("h2","","Top courses"));
      const bars=el("div","bars");
      const max=Math.max(1,...s.top.map(x=>x.n));
      s.top.forEach(x=>{
        const w=el("div");
        const sp=el("span");
        sp.append(el("b","",x.title),el("em","",x.n+" enrolled"));
        const tr=el("div");
        const i=el("i");
        i.style.width=Math.round(x.n/max*100)+"%";
        tr.appendChild(i);
        w.append(sp,tr);
        bars.appendChild(w);
      });
      if(!s.top.length)bars.appendChild(el("p","muted","No courses yet."));
      c1.appendChild(bars);
      const c2=el("div","card");
      c2.appendChild(el("h2","","Newest users"));
      const ls=el("div","list");
      s.recent.forEach(u=>{
        const r=el("div");
        const l=el("div");
        l.append(el("b","",u.name),el("small","",u.email));
        r.append(l,tag(date(u.created_at)));
        ls.appendChild(r);
      });
      c2.appendChild(ls);
      g.append(c1,c2);
      v.appendChild(g);
    }catch(e){oops(e)}
  },

  async courses(){
    const act=$("#vAct");
    let all=[];
    const box=el("div");
    const q=el("input");
    q.type="search";
    q.placeholder="Search courses";
    q.setAttribute("aria-label","Search courses");
    const tool=el("div","tool");
    tool.appendChild(q);
    $("#view").append(tool,box);

    const draw=()=>{
      const k=q.value.trim().toLowerCase();
      const list=all.filter(c=>!k||c.title.toLowerCase().includes(k)||c.category.toLowerCase().includes(k));
      box.innerHTML="";
      box.appendChild(table(["Course","Category","Level","Hours","Enrolled","Published",""],list.map(c=>{
        const sw=el("button","sw");
        sw.type="button";
        sw.setAttribute("role","switch");
        sw.setAttribute("aria-checked",String(c.published));
        sw.setAttribute("aria-label","Published: "+c.title);
        sw.onclick=async()=>{
          try{
            await api("/api/admin/courses/"+c.id,{method:"PATCH",body:JSON.stringify({published:!c.published})});
            toast(c.published?"Course hidden":"Course published");
            load();
          }catch(e){oops(e)}
        };
        const a=el("div","acts");
        a.append(btn("Edit","line sm",()=>edit(c)),btn("Delete","line sm",async()=>{
          if(!await ask("Delete course?",`"${c.title}" and its ${c.enrolled} enrollment(s) will be removed permanently.`,"Delete"))return;
          try{
            await api("/api/admin/courses/"+c.id,{method:"DELETE"});
            toast("Course deleted");
            load();
          }catch(e){oops(e)}
        }));
        return [two(c.title,c.slug),c.category,c.level,c.duration_hours+"h",String(c.enrolled),sw,a];
      }),"No courses match."));
    };

    const edit=c=>{
      const n=!c;
      const ins=form(n?"New course":"Edit course",[
        {k:"title",label:"Title",val:c?c.title:"",max:120,wide:true},
        {k:"slug",label:"Slug (URL name)",val:c?c.slug:"",max:120,wide:true,ph:"my-course"},
        {k:"category",label:"Category",val:c?c.category:"",max:80,ph:"SSC, HSC, CSE…"},
        {k:"level",label:"Level",type:"select",opts:levels.map(x=>({v:x,t:x})),val:c?c.level:"Beginner"},
        {k:"duration_hours",label:"Duration (hours)",type:"number",min:1,val:c?c.duration_hours:10},
        {k:"description",label:"Description",type:"area",val:c?c.description:"",max:1200},
        {k:"published",label:"Published (visible to students)",type:"check",val:c?c.published:true}
      ],async v=>{
        const b={...v,duration_hours:Number(v.duration_hours)};
        if(n)await api("/api/admin/courses",{method:"POST",body:JSON.stringify(b)});
        else await api("/api/admin/courses/"+c.id,{method:"PATCH",body:JSON.stringify(b)});
        toast(n?"Course created":"Course updated");
        load();
      },n?"Create course":"Save changes");
      if(n){
        let touched=false;
        ins.slug.oninput=()=>{touched=true};
        ins.title.oninput=()=>{if(!touched)ins.slug.value=slugify(ins.title.value)};
      }
    };

    const load=async()=>{
      try{
        all=(await api("/api/admin/courses")).courses;
        draw();
      }catch(e){oops(e)}
    };
    act.appendChild(btn("New course","solid",()=>edit(null)));
    q.oninput=draw;
    load();
  },

  async users(){
    const s={q:"",role:"",page:1};
    const q=el("input");
    q.type="search";
    q.placeholder="Search name or email";
    q.setAttribute("aria-label","Search users");
    const r=el("select");
    r.setAttribute("aria-label","Filter by role");
    [["","All roles"],["student","Students"],["admin","Admins"]].forEach(x=>{
      const o=el("option","",x[1]);
      o.value=x[0];
      r.appendChild(o);
    });
    const tool=el("div","tool");
    tool.append(q,r);
    const box=el("div");
    $("#view").append(tool,box);

    const load=async p=>{
      if(p)s.page=p;
      try{
        const d=await api(`/api/admin/users?q=${encodeURIComponent(s.q)}&role=${s.role}&page=${s.page}`);
        box.innerHTML="";
        box.appendChild(table(["User","Role","Status","Enrolled","Joined",""],d.users.map(u=>{
          const you=u.id===me.id;
          const a=el("div","acts");
          if(!you){
            a.append(
              btn(u.role==="admin"?"Make student":"Make admin","line sm",async()=>{
                const to=u.role==="admin"?"student":"admin";
                if(!await ask("Change role?",`${u.email} will become ${to==="admin"?"an admin with full control":"a student"}.`,"Change"))return;
                try{await api("/api/admin/users/"+u.id,{method:"PATCH",body:JSON.stringify({role:to})});toast("Role updated");load()}catch(e){oops(e)}
              }),
              btn(u.disabled?"Enable":"Disable","line sm",async()=>{
                if(!u.disabled&&!await ask("Disable account?",`${u.email} will be signed out and unable to log in.`,"Disable"))return;
                try{await api("/api/admin/users/"+u.id,{method:"PATCH",body:JSON.stringify({disabled:!u.disabled})});toast(u.disabled?"Account enabled":"Account disabled");load()}catch(e){oops(e)}
              }),
              btn("Password","line sm",()=>form("Reset password",[
                {k:"password",label:"New password",type:"text",ac:"off",max:128,wide:true,ph:"10+ chars, upper, lower, number"}
              ],async v=>{
                await api(`/api/admin/users/${u.id}/password`,{method:"POST",body:JSON.stringify(v)});
                toast("Password reset. User was signed out.");
              },"Reset password")),
              btn("Delete","line sm",async()=>{
                if(!await ask("Delete user?",`${u.email} and all their enrollments will be removed permanently.`,"Delete"))return;
                try{await api("/api/admin/users/"+u.id,{method:"DELETE"});toast("User deleted");load()}catch(e){oops(e)}
              })
            );
          }else a.appendChild(tag("You","ok"));
          return [two(u.name,u.email),tag(u.role,u.role==="admin"?"adm":""),tag(u.disabled?"Disabled":"Active",u.disabled?"off":"ok"),String(u.enrolled),date(u.created_at),a];
        }),"No users found."));
        if(d.pages>1||d.page>1)box.appendChild(pager(d,load));
      }catch(e){oops(e)}
    };

    const go=debounce(()=>{s.q=q.value.trim();s.page=1;load()},300);
    q.oninput=go;
    r.onchange=()=>{s.role=r.value;s.page=1;load()};
    $("#vAct").appendChild(btn("Add user","solid",()=>form("Add user",[
      {k:"name",label:"Full name",max:80,wide:true,ac:"off"},
      {k:"email",label:"Email",type:"email",max:160,wide:true,ac:"off"},
      {k:"password",label:"Password",type:"text",max:128,ac:"off",ph:"10+ chars, upper, lower, number"},
      {k:"role",label:"Role",type:"select",opts:[{v:"student",t:"Student"},{v:"admin",t:"Admin"}]}
    ],async v=>{
      await api("/api/admin/users",{method:"POST",body:JSON.stringify(v)});
      toast("User created");
      load();
    },"Create user")));
    load();
  },

  async enr(){
    const s={q:"",cid:0,page:1};
    let cs=[];
    try{cs=(await api("/api/admin/courses")).courses}catch(e){return oops(e)}
    const q=el("input");
    q.type="search";
    q.placeholder="Search student";
    q.setAttribute("aria-label","Search student");
    const c=el("select");
    c.setAttribute("aria-label","Filter by course");
    const o0=el("option","","All courses");
    o0.value="0";
    c.appendChild(o0);
    cs.forEach(x=>{
      const o=el("option","",x.title);
      o.value=x.id;
      c.appendChild(o);
    });
    const tool=el("div","tool");
    tool.append(q,c);
    const box=el("div");
    $("#view").append(tool,box);

    const load=async p=>{
      if(p)s.page=p;
      try{
        const d=await api(`/api/admin/enrollments?q=${encodeURIComponent(s.q)}&course_id=${s.cid}&page=${s.page}`);
        box.innerHTML="";
        box.appendChild(table(["Student","Course","Progress","Enrolled",""],d.enrollments.map(e=>{
          const i=el("input","num");
          i.type="number";i.min=0;i.max=100;i.value=e.progress;
          i.setAttribute("aria-label","Progress for "+e.name);
          const w=el("div","inl");
          w.append(i,btn("Save","line sm",async()=>{
            try{await api(`/api/admin/enrollments/${e.user_id}/${e.course_id}`,{method:"PATCH",body:JSON.stringify({progress:Number(i.value)})});toast("Progress saved")}catch(x){oops(x)}
          }));
          const a=btn("Remove","line sm",async()=>{
            if(!await ask("Remove enrollment?",`${e.email} will lose access to "${e.title}" and their progress.`,"Remove"))return;
            try{await api(`/api/admin/enrollments/${e.user_id}/${e.course_id}`,{method:"DELETE"});toast("Enrollment removed");load()}catch(x){oops(x)}
          });
          return [two(e.name,e.email),e.title,w,date(e.enrolled_at),a];
        }),"No enrollments found."));
        if(d.pages>1||d.page>1)box.appendChild(pager(d,load));
      }catch(e){oops(e)}
    };

    q.oninput=debounce(()=>{s.q=q.value.trim();s.page=1;load()},300);
    c.onchange=()=>{s.cid=Number(c.value);s.page=1;load()};
    $("#vAct").appendChild(btn("Enroll student","solid",()=>form("Enroll student",[
      {k:"email",label:"Student email",type:"email",wide:true,ac:"off"},
      {k:"course",label:"Course",type:"select",wide:true,opts:cs.map(x=>({v:x.id,t:x.title}))}
    ],async v=>{
      const em=v.email.trim().toLowerCase();
      const d=await api("/api/admin/users?q="+encodeURIComponent(em));
      const u=d.users.find(x=>x.email===em);
      if(!u)throw new Error("No user with that email");
      await api("/api/admin/enrollments",{method:"POST",body:JSON.stringify({user_id:u.id,course_id:Number(v.course)})});
      toast("Student enrolled");
      load();
    },"Enroll")));
    load();
  },

  async log(){
    const box=el("div");
    $("#view").appendChild(box);
    const load=async p=>{
      try{
        const d=await api("/api/admin/audit?page="+(p||1));
        box.innerHTML="";
        box.appendChild(table(["When","Admin","Action","Target"],d.logs.map(l=>[date(l.created_at,true),l.admin_email,tag(l.action),l.target||"–"]),"No activity recorded yet."));
        if(d.pages>1)box.appendChild(pager(d,load));
      }catch(e){oops(e)}
    };
    load(1);
  }
};

function showLogin(){
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
  $("#lPass").value="";
  setTimeout(()=>$("#lEmail").focus(),20);
}

function showApp(){
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#meName").textContent=me.name;
  setView(cur);
}

$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const er=$("#lErr");
  const go=$("#lGo");
  er.textContent="";
  const email=$("#lEmail").value.trim();
  const password=$("#lPass").value;
  if(!email||!password){er.textContent="Email আর password দাও।";return}
  go.disabled=true;
  try{
    const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});
    csrf=d.csrfToken;
    if(d.user.role!=="admin"){
      await api("/api/auth/logout",{method:"POST"});
      csrf=(await api("/api/csrf")).csrfToken;
      er.textContent="এই account-এ admin access নেই।";
    }else{
      me=d.user;
      cur="overview";
      showApp();
    }
  }catch(x){
    er.textContent=x.message;
  }
  go.disabled=false;
});

$("#lShow").onclick=()=>{
  const i=$("#lPass");
  const h=i.type==="password";
  i.type=h?"text":"password";
  $("#lShow").textContent=h?"Hide":"Show";
};

$("#tabs").addEventListener("click",e=>{
  const b=e.target.closest("button");
  if(b)setView(b.dataset.v);
});

$("#outBtn").onclick=async()=>{
  try{
    await api("/api/auth/logout",{method:"POST"});
    csrf=(await api("/api/csrf")).csrfToken;
  }catch(e){}
  me=null;
  showLogin();
};

["dForm","dAsk"].forEach(id=>{
  const d=$("#"+id);
  d.addEventListener("click",e=>{if(e.target===d)d.close()});
});

(async()=>{
  try{
    csrf=(await api("/api/csrf")).csrfToken;
    const d=await api("/api/me");
    if(d.user&&d.user.role==="admin"){
      me=d.user;
      showApp();
    }else showLogin();
  }catch(e){
    showLogin();
  }
})();
