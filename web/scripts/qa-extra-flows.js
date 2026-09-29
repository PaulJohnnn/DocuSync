const { chromium } = require('playwright');
const BASE='http://localhost:3000';
const R=[]; const ck=(c,n,d='')=>{R.push(c);console.log(`  ${c?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`)};
async function login(p){await p.goto(`${BASE}/app/login`);await p.waitForSelector('input[placeholder="Enter your username"]',{timeout:25000});
 await p.fill('input[placeholder="Enter your username"]','admin');await p.fill('input[placeholder="Enter your password"]','admin');
 await p.click('button:has-text("Log In")');await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:25000});}
(async()=>{
 const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:900}});const p=await c.newPage();
 try{
  await login(p);
  // room + lock + kick endpoints
  await p.goto(`${BASE}/app/peers`);
  await p.click('button:has-text("Create Room")');
  await p.fill('input[placeholder*="Thesis Project"]','Extra QA');
  await p.click('button:has-text("Generate Room")');
  await p.waitForSelector('text=INVITE CODE',{timeout:25000});
  const otp=(await p.locator('text=INVITE CODE').locator('xpath=following-sibling::*[1]').innerText()).trim();
  await p.click('text=Enter Workspace'); await p.waitForTimeout(1500);

  console.log('\n[room controls]');
  const nodeId = await p.evaluate(()=>{const u=JSON.parse(sessionStorage.getItem('docusync_auth_user'));return localStorage.getItem(`ds_${u.id}_node_id`)||localStorage.getItem('node_id');});
  const lock = await p.evaluate(async ({otp,nodeId})=>{const r=await fetch('/api/lobby/lock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({otp,nodeId,isLocked:true})});return {s:r.status,b:await r.text()};},{otp,nodeId});
  ck(lock.s===200||lock.s===403,'room lock endpoint responds sanely',`HTTP ${lock.s}`);
  const kickOther = await p.evaluate(async (otp)=>{const r=await fetch('/api/lobby/kick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({otp,nodeId:'not-the-host',targetNodeId:'someone'})});return r.status;},otp);
  ck(kickOther>=400,'kick refuses a non-host',`HTTP ${kickOther}`);

  console.log('\n[file upload]');
  await p.goto(`${BASE}/app/files`); await p.waitForTimeout(2500);
  const hasUpload = await p.evaluate(()=>!!document.querySelector('input[type="file"]') || /Upload file/i.test(document.body.innerText));
  ck(hasUpload,'upload control is present');
  const up = await p.evaluate(async (otp)=>{
    const html='<p>uploaded via QA</p>';
    const r=await fetch('/api/lobby/files',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({otp,file:{fileId:987654,fileName:'uploaded.txt',content:html,contentLength:html.length,sharedBy:'QA',sharedAt:new Date().toISOString()}})});
    if(!r.ok) return 'post failed '+r.status;
    const l=await (await fetch(`/api/lobby/files?otp=${otp}`)).json();
    return (l.files||[]).some(f=>f.fileName==='uploaded.txt')?'listed':'not listed';
  },otp);
  ck(up==='listed','a shared file appears in the room list',up);
  const del = await p.evaluate(async (otp)=>{
    await fetch(`/api/lobby/files?otp=${otp}&fileId=987654&fileName=uploaded.txt`,{method:'DELETE'});
    const l=await (await fetch(`/api/lobby/files?otp=${otp}`)).json();
    return (l.files||[]).some(f=>f.fileName==='uploaded.txt')?'still there':'removed';
  },otp);
  ck(del==='removed','deleting a room file removes it from the list',del);

  console.log('\n[forgot PIN]');
  const forgot = await p.evaluate(async ()=>{const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'forgot',email:'definitely-not-a-user'})});return r.status;});
  ck(forgot>=400,'forgot-PIN refuses an unknown account',`HTTP ${forgot}`);

  console.log('\n[api hardening]');
  const bad=[['/api/lobby/doc','POST',{}],['/api/lobby/create','POST',{}],['/api/lobby/files','POST',{}]];
  for(const [u,m,body] of bad){
    const s=await p.evaluate(async ({u,m,body})=>{const r=await fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.status;},{u,m,body});
    ck(s>=400,`${u} rejects an empty body`,`HTTP ${s}`);
  }
  await p.evaluate(async (o)=>{await fetch('/api/admin/delete-group',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({otp:o})});},otp);
 }catch(e){ck(false,'extra suite completed',e.message.split('\n')[0]);}
 finally{const bad=R.filter(x=>!x).length;console.log(`\n${R.length-bad}/${R.length} checks passed`);await b.close();}
})();
