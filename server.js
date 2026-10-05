const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const OWNER_TELEGRAM = process.env.OWNER_TELEGRAM || "your_telegram";

const ROOT = __dirname;
const UPLOADS = path.join(ROOT, "uploads");
fs.mkdirSync(UPLOADS, { recursive: true });

const db = new Database(path.join(ROOT, "data.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL COLLATE NOCASE UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'Ученик',
 title TEXT DEFAULT '',
 avatar TEXT DEFAULT '',
 banner TEXT DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 text TEXT DEFAULT '',
 media_url TEXT DEFAULT '',
 media_type TEXT DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS likes (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 post_id INTEGER NOT NULL,
 PRIMARY KEY(user_id, post_id)
);
CREATE TABLE IF NOT EXISTS posts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 text TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS claim_links (
 token_hash TEXT PRIMARY KEY,
 role TEXT NOT NULL,
 expires_at INTEGER,
 used_at INTEGER
);
`);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, "public")));
app.use("/uploads", express.static(UPLOADS, { maxAge: "1h" }));

const authLimiter = rateLimit({ windowMs: 10*60*1000, max: 30, standardHeaders: true, legacyHeaders: false });
const messageLimiter = rateLimit({ windowMs: 10*1000, max: 12, standardHeaders: true, legacyHeaders: false });

function cleanName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}
function cleanText(v, max=1000) {
  return String(v || "").trim().slice(0,max);
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function currentUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i,"") || req.cookies?.session;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?
  `).get(token);
  return row || null;
}
function requireAuth(req,res,next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({error:"Нужно войти в аккаунт"});
  req.user=u; next();
}
const OWNER_USER_ID = "bd29193d-855e-4155-9a09-76a196c58d89";

function requireOwner(req,res,next) {
  if (!req.user || req.user.id !== OWNER_USER_ID)
    return res.status(403).json({error:"Только владелец сайта может менять роли и титулы"});
  next();
}

function requireModAdmin(req,res,next) {
  if (!req.user || !["Владелец","Модератор","Администратор"].includes(req.user.role))
    return res.status(403).json({error:"Недостаточно прав"});
  next();
}

function id() { return crypto.randomUUID(); }

const storage = multer.diskStorage({
  destination: (_,__,cb)=>cb(null, UPLOADS),
  filename: (_,file,cb)=>cb(null, crypto.randomUUID()+path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024, files: 2 },
  fileFilter: (_,file,cb)=>{
    const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) ||
               /^video\/(mp4|webm|quicktime)$/.test(file.mimetype);
    cb(ok ? null : new Error("Разрешены только изображения и видео"), ok);
  }
});

app.post("/api/register", authLimiter, async (req,res)=>{
  const name=cleanName(req.body.name), password=String(req.body.password||"");
  if (name.length<2 || name.length>30) return res.status(400).json({error:"Имя: от 2 до 30 символов"});
  if (password.length<6 || password.length>100) return res.status(400).json({error:"Пароль: от 6 символов"});
  if (db.prepare("SELECT id FROM users WHERE name=? COLLATE NOCASE").get(name))
    return res.status(409).json({error:"Такое имя уже занято"});
  const count=db.prepare("SELECT COUNT(*) c FROM users").get().c;
  const role=count===0 ? "Владелец" : "Ученик";
  const userId=id();
  const hash=await bcrypt.hash(password,12);
  db.prepare("INSERT INTO users(id,name,password_hash,role,created_at) VALUES(?,?,?,?,?)")
    .run(userId,name,hash,role,Date.now());
  const token=crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)").run(token,userId,Date.now());
  res.json({token,user:publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(userId))});
});

app.post("/api/login", authLimiter, async (req,res)=>{
  const name=cleanName(req.body.name), password=String(req.body.password||"");
  const u=db.prepare("SELECT * FROM users WHERE name=? COLLATE NOCASE").get(name);
  if (!u || !(await bcrypt.compare(password,u.password_hash))) return res.status(401).json({error:"Неверное имя или пароль"});
  const token=crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)").run(token,u.id,Date.now());
  res.json({token,user:publicUser(u)});
});
app.post("/api/logout", requireAuth, (req,res)=>{
  const token=req.headers.authorization?.replace(/^Bearer\s+/i,"");
  if(token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
  res.json({ok:true});
});
function publicUser(u) {
  return {id:u.id,name:u.name,role:u.role,title:u.title||"",avatar:u.avatar||"",banner:u.banner||""};
}
app.get("/api/me", requireAuth, (req,res)=>res.json({user:publicUser(req.user)}));

app.delete("/api/messages/:id", requireAuth, requireModAdmin, (req,res)=>{ const id=Number(req.params.id); const m=db.prepare("SELECT id FROM messages WHERE id=?").get(id); if(!m) return res.status(404).json({error:"Сообщение не найдено"}); db.prepare("DELETE FROM messages WHERE id=?").run(id); res.json({ok:true}); });

app.get("/api/messages", (req,res)=>{
  const rows=db.prepare(`
    SELECT m.id,m.text,m.media_url,m.media_type,m.created_at,u.name,u.role,u.title,u.avatar
    FROM messages m JOIN users u ON u.id=m.user_id
    ORDER BY m.id DESC LIMIT 200
  `).all().reverse();
  res.json({messages:rows});
});

app.post("/api/messages", requireAuth, messageLimiter, upload.single("media"), async (req,res)=>{
  const text=cleanText(req.body.text,2000);
  if (!text && !req.file) return res.status(400).json({error:"Сообщение пустое"});
  let mediaUrl="", mediaType="";
  if(req.file){
    mediaUrl="/uploads/"+req.file.filename;
    mediaType=req.file.mimetype;
    if(req.file.mimetype.startsWith("image/")){
      const input=req.file.path, tmp=input+".jpg";
      try {
        await sharp(input).rotate().resize({width:1800,height:1800,fit:"inside",withoutEnlargement:true})
          .jpeg({quality:82,mozjpeg:true}).toFile(tmp);
        fs.unlinkSync(input); fs.renameSync(tmp,input);
        mediaType="image/jpeg";
      } catch(e) {}
    }
  }
  const info=db.prepare("INSERT INTO messages(user_id,text,media_url,media_type,created_at) VALUES(?,?,?,?,?)")
    .run(req.user.id,text,mediaUrl,mediaType,Date.now());
  res.json({ok:true,id:info.lastInsertRowid});
});

app.post("/api/profile", requireAuth, upload.fields([
  {name:"avatar", maxCount:1},
  {name:"banner", maxCount:1}
]), async (req,res)=>{
  const title=cleanText(req.body.title,40);
  const name=cleanName(req.body.name);

  if(name.length<2 || name.length>30)
    return res.status(400).json({error:"Некорректное имя"});

  const other=db.prepare(
    "SELECT id FROM users WHERE name=? COLLATE NOCASE AND id<>?"
  ).get(name,req.user.id);

  if(other)
    return res.status(409).json({error:"Имя уже занято"});

  let avatar=req.user.avatar||"";
  let banner=req.user.banner||"";

  const avatarFile=req.files?.avatar?.[0];
  const bannerFile=req.files?.banner?.[0];

  if(avatarFile){
    if(!avatarFile.mimetype.startsWith("image/")){
      fs.unlinkSync(avatarFile.path);
      return res.status(400).json({error:"Для аватарки нужна картинка"});
    }
    avatar="/uploads/"+avatarFile.filename;
  }

  if(bannerFile){
    if(!bannerFile.mimetype.startsWith("image/")){
      fs.unlinkSync(bannerFile.path);
      return res.status(400).json({error:"Для баннера нужна картинка"});
    }
    banner="/uploads/"+bannerFile.filename;
  }

  db.prepare(
    "UPDATE users SET name=?,title=?,avatar=?,banner=? WHERE id=?"
  ).run(name,title,avatar,banner,req.user.id);

  res.json({
    user:publicUser(
      db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id)
    )
  });
});

app.post("/api/admin/users/:id/role", requireAuth, requireOwner, (req,res)=>{ const role=String(req.body.role||""); if(!["Ученик","Старшеклассник","Модератор","Администратор"].includes(role)) return res.status(400).json({error:"Недопустимая роль"}); const u=db.prepare("SELECT id,name FROM users WHERE id=?").get(req.params.id); if(!u) return res.status(404).json({error:"Пользователь не найден"}); db.prepare("UPDATE users SET role=? WHERE id=?").run(role,req.params.id); res.json({ok:true,user:publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id))}); });
app.post("/api/admin/users/:id/title", requireAuth, requireOwner, (req,res)=>{
  const title=String(req.body.title||"").trim().slice(0,40);
  const u=db.prepare("SELECT id,name FROM users WHERE id=?").get(req.params.id);
  if(!u) return res.status(404).json({error:"Пользователь не найден"});
  db.prepare("UPDATE users SET title=? WHERE id=?").run(title,req.params.id);
  res.json({ok:true,user:publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id))});
});

app.post("/api/admin/users/:id/manage", requireAuth, requireOwner, (req,res)=>{
  const role=String(req.body.role||"");
  const title=String(req.body.title||"").trim().slice(0,40);
  if(!["Ученик","Старшеклассник","Модератор","Администратор"].includes(role))
    return res.status(400).json({error:"Недопустимая роль"});
  const u=db.prepare("SELECT id,name FROM users WHERE id=?").get(req.params.id);
  if(!u) return res.status(404).json({error:"Пользователь не найден"});
  db.prepare("UPDATE users SET role=?, title=? WHERE id=?").run(role,title,req.params.id);
  res.json({ok:true,user:publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id))});
});

app.get("/api/users", (req,res)=>{
  const rows=db.prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE").all().map(publicUser);
  res.json({users:rows});
});

app.get("/api/posts",(req,res)=>{
  const rows=db.prepare(`
    SELECT p.*,u.name,u.role,u.title,u.avatar,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) likes
    FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 100
  `).all();
  res.json({posts:rows});
});
app.delete("/api/posts/:id", requireAuth, requireModAdmin, (req,res)=>{ const id=Number(req.params.id); const p=db.prepare("SELECT id FROM posts WHERE id=?").get(id); if(!p) return res.status(404).json({error:"Пост не найден"}); db.prepare("DELETE FROM likes WHERE post_id=?").run(id); db.prepare("DELETE FROM posts WHERE id=?").run(id); res.json({ok:true}); });
app.post("/api/posts", requireAuth, messageLimiter, (req,res)=>{
  const text=cleanText(req.body.text,2000);
  if(!text) return res.status(400).json({error:"Пустой пост"});
  const info=db.prepare("INSERT INTO posts(user_id,text,created_at) VALUES(?,?,?)").run(req.user.id,text,Date.now());
  res.json({ok:true,id:info.lastInsertRowid});
});
app.post("/api/posts/:id/like", requireAuth, messageLimiter, (req,res)=>{
  try {
    db.prepare("INSERT INTO likes(user_id,post_id) VALUES(?,?)").run(req.user.id,Number(req.params.id));
  } catch(e) {
    return res.status(409).json({error:"Ты уже поставил лайк"});
  }
  const c=db.prepare("SELECT COUNT(*) c FROM likes WHERE post_id=?").get(Number(req.params.id)).c;
  res.json({likes:c});
});

app.post("/api/admin/claim-links", requireAuth, requireOwner, (req,res)=>{
  const role=String(req.body.role||"");
  if(!["Ученик","Старшеклассник","Модератор","Администратор"].includes(role))
    return res.status(400).json({error:"Недопустимая роль"});
  const token=crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO claim_links(token_hash,role,expires_at) VALUES(?,?,?)")
    .run(hashToken(token),role,Date.now()+7*24*60*60*1000);

  res.json({url:`/claim/${token}`,role});
});
app.post("/api/claim/:token", requireAuth, requireOwner, (req,res)=>{
  const row = db.prepare("SELECT * FROM claim_links WHERE token_hash=?")
    .get(hashToken(req.params.token));

  if(!row || row.used_at || (row.expires_at && row.expires_at < Date.now()))
    return res.status(410).json({error:"Ссылка недействительна"});

  db.prepare("UPDATE users SET role=? WHERE id=?")
    .run(row.role, req.user.id);

  db.prepare("UPDATE claim_links SET used_at=? WHERE token_hash=?")
    .run(Date.now(), row.token_hash);

  res.json({ok:true, role:row.role});
});

app.use((err,req,res,next)=>{
  if(req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  res.status(400).json({error:err.message||"Ошибка загрузки"});
});

app.listen(PORT,()=>console.log(`anon92 v1 running on http://localhost:${PORT}`));
