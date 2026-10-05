
let token=localStorage.getItem("school92_token")||"";
let me=null;
const app=document.querySelector("#app"), nav=document.querySelector("#nav");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(s){const t=document.querySelector("#toast");t.textContent=s;t.className="toast";setTimeout(()=>t.className="",2500)}
async function api(url,opt={}){opt.headers=opt.headers||{};if(token)opt.headers.Authorization="Bearer "+token;const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Ошибка");return d}
async function loadMe(){try{me=(await api("/api/me")).user}catch{me=null;token="";localStorage.removeItem("school92_token")}}
function setPage(p){nav.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.page===p));({home,write,chat,profile,contact,users,owner:ownerPanel}[p]||home)()}
function home(){app.innerHTML=`<div class="wrap"><div class="card"><h1>Добро пожаловать 🌸</h1><p>Общайся, пиши посты и отправляй сообщения.</p>${me?`<p class="success">Ты вошёл как <b>${esc(me.name)}</b> — ${esc(me.role)}</p>`:`<button class="primary" onclick="auth()">Войти / зарегистрироваться</button>`}</div><div class="card"><h2>Последние посты</h2><div id="posts">Загрузка...</div></div></div>`;loadPosts()}
async function loadPosts(){try{const d=await api("/api/posts");document.querySelector("#posts").innerHTML=d.posts.length?d.posts.map(p=>`<div class="post"><b>${esc(p.name)}</b> <span class="muted">${esc(p.role)}</span><p>${esc(p.text)}</p><button onclick="likePost(${p.id})">❤️ ${p.likes}</button>${me&&["Владелец","Модератор","Администратор"].includes(me.role)?`<button class="danger" onclick="deletePost(${p.id})">🗑️ Удалить</button>`:""}</div>`).join(""):"Пока постов нет."}catch(e){}}
async function likePost(id){try{await api(`/api/posts/${id}/like`,{method:"POST"});loadPosts()}catch(e){toast(e.message)}}
async function deletePost(id){if(!confirm("Удалить этот пост?"))return;try{await api(`/api/posts/${id}`,{method:"DELETE"});loadPosts()}catch(e){toast(e.message)}}
function auth(){app.innerHTML=`<div class="wrap"><div class="card"><h2>Вход</h2><input id="an" placeholder="Имя"><input id="ap" type="password" placeholder="Пароль"><div class="row"><button class="primary" onclick="login()">Войти</button><button onclick="register()">Создать аккаунт</button></div><p id="ae" class="error"></p></div></div>`}
async function login(){try{const d=await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:an.value,password:ap.value})});token=d.token;localStorage.setItem("school92_token",token);await loadMe();setPage("home")}catch(e){ae.textContent=e.message}}
async function register(){try{const d=await api("/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:an.value,password:ap.value})});token=d.token;localStorage.setItem("school92_token",token);await loadMe();setPage("home")}catch(e){ae.textContent=e.message}}
function write(){if(!me)return auth();app.innerHTML=`<div class="wrap"><div class="card"><h2>✍️ Новый пост</h2><textarea id="pt" placeholder="Что хочешь написать?"></textarea><button class="primary" onclick="postIt()">Опубликовать</button></div></div>`}
async function postIt(){try{await api("/api/posts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:pt.value})});setPage("home")}catch(e){toast(e.message)}}
function chat(){app.innerHTML=`<div class="wrap"><div class="card"><h2>💬 Чат</h2><div id="messages">Загрузка...</div><form onsubmit="sendMessage(event)"><input name="text" placeholder="Сообщение"><button class="primary">Отправить</button></form></div></div>`;loadMessages()}
async function loadMessages(){try{const d=await api("/api/messages");document.querySelector("#messages").innerHTML=d.messages.length?d.messages.map(m=>`<div class="msg"><b>${esc(m.name)}</b> <span class="muted">${esc(m.role)} ${esc(m.title)}</span><div>${esc(m.text)}</div>${m.media_url?(m.media_type.startsWith("image/")?`<img class="media" src="${m.media_url}">`:`<video class="media" controls src="${m.media_url}"></video>`):""}${me&&["Владелец","Модератор","Администратор"].includes(me.role)?`<button class="danger" onclick="deleteMessage(${m.id})">🗑️ Удалить</button>`:""}</div>`).join(""):"Пока сообщений нет."}catch(e){}}
async function deleteMessage(id){if(!confirm("Удалить это сообщение?"))return;try{await api(`/api/messages/${id}`,{method:"DELETE"});loadMessages()}catch(e){toast(e.message)}}
async function sendMessage(e){e.preventDefault();try{const fd=new FormData(e.target);await api("/api/messages",{method:"POST",body:fd});e.target.reset();loadMessages()}catch(e){toast(e.message)}}
function profile(){
  if(!me)return auth();

  const banner = me.banner
    ? '<img src="' + esc(me.banner) + '">'
    : '';

  const avatar = me.avatar
    ? '<img class="avatar" src="' + esc(me.avatar) + '">'
    : '<div class="avatar"></div>';

  app.innerHTML =
    '<div class="wrap">' +
      '<div class="card">' +
        '<div class="banner">' + banner + '<div class="petals"></div></div>' +
        '<div class="row" style="margin-top:-28px;position:relative">' +
          avatar +
          '<h2>' + esc(me.name) + '</h2>' +
        '</div>' +
        '<p>' + esc(me.role) + (me.title ? ' • ' + esc(me.title) : '') + '</p>' +
        '<hr>' +
        '<h3>Редактировать профиль</h3>' +
        '<form id="pf">' +
          '<input name="name" value="' + esc(me.name) + '" maxlength="30">' +
          '<input name="title" value="' + esc(me.title || '') + '" maxlength="40" placeholder="Звание, например 🌸 Сакура">' +
          '<label>Аватарка <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp,image/gif"></label><label>Баннер <input type="file" name="banner" accept="image/jpeg,image/png,image/webp,image/gif"></label>' +
          '<button class="primary">Сохранить</button>' +
        '</form>' +
        '<button onclick="logout()">Выйти</button>' +
      '</div>' +
    '</div>';

  document.querySelector("#pf").onsubmit = saveProfile;
}

async function saveProfile(e){e.preventDefault();try{const d=await api("/api/profile",{method:"POST",body:new FormData(e.target)});me=d.user;profile()}catch(e){toast(e.message)}}
async function logout(){await api("/api/logout",{method:"POST"}).catch(()=>{});token="";me=null;localStorage.removeItem("school92_token");setPage("home")}
async function users(){
  try{
    const d=await api("/api/users");

    app.innerHTML='<div class="wrap"><div class="card"><h2>👥 Пользователи</h2><p class="muted">Нажми на имя, чтобы открыть профиль.</p><div id="usersList">'+
      d.users.map(u=>`
        <div class="card" onclick="openUser('${u.id}')" style="cursor:pointer;margin-top:12px">
          <h3>${esc(u.name)}</h3>
          <p>🎓 Ранг: <b>${esc(u.role)}</b></p>
          <p>🏷️ Звание: <b>${esc(u.title||"Нет звания")}</b></p>
        </div>
      `).join("")+
      '</div></div></div>';

  }catch(e){
    toast(e.message);
  }
}

async function saveUserManage(id){
  const role=document.querySelector("#role-"+id).value;
  const title=document.querySelector("#title-"+id).value;
  try{
    await api("/api/admin/users/"+id+"/manage",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({role,title})
    });
    toast("Роль и титул сохранены");
    users();
  }catch(e){
    toast(e.message);
  }
}

async function openUser(id){
  try{
    const d=await api("/api/users");
    const u=d.users.find(x=>x.id===id);
    if(!u)return toast("Пользователь не найден");

    const banner=u.banner
      ? '<img src="'+esc(u.banner)+'">'
      : '';

    const avatar=u.avatar
      ? '<img class="avatar" src="'+esc(u.avatar)+'">'
      : '<div class="avatar"></div>';

    app.innerHTML=
      '<div class="wrap">'+
        '<div class="card">'+
          '<div class="banner">'+banner+'<div class="petals"></div></div>'+
          '<div class="row" style="margin-top:-28px;position:relative">'+
            avatar+
            '<h2>'+esc(u.name)+'</h2>'+
          '</div>'+
          '<p><b>'+esc(u.role)+'</b>'+(u.title?' • '+esc(u.title):'')+'</p>'+
          '<hr>'+
          '<button onclick="users()">← Назад к пользователям</button>'+
        '</div>'+
      '</div>';
  }catch(e){
    toast(e.message);
  }
}

function ownerPanel(){
  if(!me || me.id!=="bd29193d-855e-4155-9a09-76a196c58d89"){
    toast("Нет доступа");
    return;
  }

  app.innerHTML=`<div class="wrap">
    <div class="card">
      <h2>👑 Панель владельца</h2>
      <p class="muted">Здесь только владелец может менять роли и звания.</p>
      <div id="ownerUsers">Загрузка...</div>
    </div>
  </div>`;

  loadOwnerUsers();
}

async function loadOwnerUsers(){
  try{
    const d=await api("/api/users");

    document.querySelector("#ownerUsers").innerHTML=d.users.map(u=>`
      <div class="post">
        <b>${esc(u.name)}</b>
        <div class="muted">${esc(u.role)} ${u.title?"• "+esc(u.title):""}</div>

        <select id="role_${u.id}">
          ${["Ученик","Старшеклассник","Модератор","Администратор"]
            .map(r=>`<option ${u.role===r?"selected":""}>${r}</option>`).join("")}
        </select>

        <input id="title_${u.id}"
               value="${esc(u.title||"")}"
               maxlength="40"
               placeholder="Звание">

        <button onclick="saveOwnerUser('${u.id}')">
          💾 Сохранить
        </button>
      </div>
    `).join("");
  }catch(e){
    toast(e.message);
  }
}

async function saveOwnerUser(id){
  try{
    const role=document.querySelector("#role_"+id).value;
    const title=document.querySelector("#title_"+id).value;

    await api("/api/admin/users/"+id+"/manage",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({role,title})
    });

    toast("Сохранено");
    loadOwnerUsers();
  }catch(e){
    toast(e.message);
  }
}

function contact(){app.innerHTML=`<div class="wrap"><div class="card"><h1>📞 Связаться со мной</h1><p>Если хочешь связаться с владельцем сайта — напиши мне в Telegram.</p><a href="https://t.me/${encodeURIComponent("Caxaroktoop")}" target="_blank"><button class="primary">✈️ Написать в Telegram</button></a></div></div>`}
nav.querySelectorAll("button").forEach(b=>b.onclick=()=>setPage(b.dataset.page));
(async()=>{
  await loadMe();

  if(me && me.id==="bd29193d-855e-4155-9a09-76a196c58d89"){
    if(!nav.querySelector('[data-page="owner"]')){
      const b=document.createElement("button");
      b.dataset.page="owner";
      b.textContent="👑 Владелец";
      b.onclick=()=>setPage("owner");
      nav.appendChild(b);
    }
  }

  setPage("home");
})();

