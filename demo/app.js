const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
let role = 0;
let invitation;
let guests;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let last = '', busy = false, polling;
async function api(path, data = {}) {
  if(path==='create'){
    if(!/^https:\/\/open\.kakao\.com\/o\/[A-Za-z0-9_-]+$/.test(data.room)) throw Error('오픈채팅 링크를 확인해 주세요.');
    invitation=data;
    guests=[{},{}];
    return {};
  }
  const me=guests[role], other=guests[1-role];
  if(path==='respond'){
    if(data.action==='join') Object.assign(me,data);
    if(data.action==='accept') me.decision='yes';
    if(data.action==='decline') me.decision='no';
  }
  const state={host:invitation.host,note:invitation.note};
  if([me,other].some(g=>g.decision==='no')) return {...state,stage:'closed'};
  if(!me.name) return {...state,stage:'join'};
  if(!other.name) return {...state,stage:'waiting'};
  Object.assign(state,{name:other.name,bio:other.bio,photo:other.photo,question:'요즘 쉬는 날에는 어떤 일을 가장 즐기세요?'});
  if(me.decision==='yes' && other.decision==='yes') return {...state, stage:'matched',room:invitation.room};
  return {...state,stage:me.decision==='yes'?'accepted':'review'};
}
function errorText(err){ return err instanceof TypeError ? '연결이 끊겼어요. 잠시 후 다시 시도해 주세요.' : err.message; }
function home(){
  app.innerHTML = `
    <div class="layout wrap" data-enter>
      <section class="opening">
        <h1>너에게 소개하고<br>싶은 친구가 있어.</h1>
        <p class="lead">친구 2명에게 각자의 편지를 보내세요.<br>둘 다 만나고 싶을 때 카카오톡으로 이어져요.</p>
        <img class="letters" src="./letters.jpg" alt="" width="1152" height="768">
      </section>
      <form class="panel" id="create">
        <h2>혼자 체험하기</h2><p>한 화면에서 두 친구 역할을 바꿔보세요. 예시를 그대로 쓰거나 바꿔도 돼요. 새로고침하면 처음부터 시작해요.</p>
        <label for="host">보내는 사람</label>
        <input id="host" name="host" value="민지" placeholder="친구들이 알아볼 이름" maxlength="24" required>
        <label for="note">두 사람이 떠오른 이유</label>
        <textarea id="note" name="note" placeholder="둘 다 작은 영화관을 좋아해서, 함께 영화 보면 좋겠다 싶었어." maxlength="220" aria-describedby="note-hint" required>두 사람 다 독립영화를 좋아해서 소개하고 싶었어.</textarea>
        <small id="note-hint">이 글은 두 친구에게 그대로 전달돼요.</small>
        <label for="room">그룹 오픈채팅 초대 링크</label>
        <input id="room" type="url" name="room" value="https://open.kakao.com/o/demo" placeholder="https://open.kakao.com/o/…" maxlength="120" required>
        <details class="room-help"><summary>초대 링크는 어디서 가져오나요?</summary><p>카카오톡에서 두 친구가 함께 입장할 그룹 오픈채팅방을 만들고 초대 링크를 복사하세요. 두 사람 모두 수락하면 이 주소가 열려요.</p></details>
        <button class="primary">첫 번째 친구로 체험하기</button>
      </form>
    </div>`;
  document.querySelector('#create').onsubmit = async e=>{
    e.preventDefault();const form=e.currentTarget, btn=form.querySelector('button');btn.disabled=true;
    try{const r=await api('create',Object.fromEntries(new FormData(form))); notice.textContent='';links(r.invites);}
    catch(err){notice.textContent=errorText(err);btn.disabled=false;}
  };
}
function links(){
  const nav=document.querySelector('#roles');
  nav.innerHTML='<p>체험할 친구를 선택하세요</p><button>첫 번째 친구</button> <button>두 번째 친구</button>';
  const selectRole=async index=>{
    role=index;last='';notice.textContent='';
    nav.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===role)));
    render(await api('state'));
  };
  nav.querySelectorAll('button').forEach((button,i)=>button.onclick=()=>selectRole(i));
  selectRole(0);
}
async function resize(file){
  if (!file?.size) return '';
  if (file.size>12*1024*1024) throw Error('12MB 이하 사진을 골라 주세요.');
  const img=new Image(), url=URL.createObjectURL(file);
  try{img.src=url;await img.decode();
    const scale=Math.min(1,600/Math.max(img.width,img.height));const c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.78);
  }catch{throw Error('사진을 열 수 없어요. JPG나 PNG로 다시 선택해 주세요.');}finally{URL.revokeObjectURL(url);}
}
async function respond(body){
  if(busy)return;busy=true;
  try{render(await api('respond',body));notice.textContent='';}catch(err){notice.textContent=errorText(err);}finally{busy=false;}
}
function render(s){
  const serial=JSON.stringify(s);if(last===serial)return;last=serial;
  const h=escapeHtml, intro=`<p class="muted">${h(s.host)}님이 보낸 소개 편지</p><blockquote class="quote">${h(s.note)}</blockquote>`;
  let content='';
  if(s.stage==='join')content=`<h1>소개받아 보실래요?</h1>${intro}<form id="join"><label for="name">이름 또는 별명</label><input id="name" maxlength="24" required><label for="bio">상대에게 전할 짧은 소개</label><textarea id="bio" maxlength="220" placeholder="쉬는 날 즐기는 일이나 요즘 관심사" required></textarea><label for="photo">내 사진 <small>(선택)</small></label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp"><label class="check"><input id="consent" type="checkbox" required> 서로 작성하면 내 소개와 선택한 사진을 상대에게 공개해요.</label><button class="primary">소개 편지 보내기</button></form>`;
  if(s.stage==='waiting')content=`<h1>내 편지를 보냈어요.</h1><p>상대도 편지를 보내면 이곳에서 서로의 소개를 읽을 수 있어요.</p><p class="status">상대의 편지를 기다리는 중</p>`;
  if(['review','accepted','matched'].includes(s.stage)){
    content=`<h1>${h(s.name)}님의 소개</h1>${intro}${s.photo?`<img class="photo" src="${h(s.photo)}" alt="상대가 공개한 프로필 사진">`:''}<p class="quote">${h(s.bio)}</p><div class="question"><h2>첫 대화 질문</h2><p>${h(s.question)}</p><small>${s.ai?'이 기기의 AI가 공개 소개를 읽고 만든 질문':'기본 대화 질문'}</small></div>`;
    if(s.stage==='review')content+='<button class="primary" id="yes">저도 만나보고 싶어요</button>';
    if(s.stage==='accepted')content+='<p class="status">내 마음을 전했어요. 서로 수락하면 여기에 오픈채팅 링크가 열려요.</p>';
    if(s.stage==='matched')content+=`<p class="status">두 분 모두 만나보고 싶다고 답했어요.</p><a class="button kakao" target="_blank" rel="noreferrer" ${s.room.endsWith('/demo')?'aria-disabled="true"':'href="'+h(s.room)+'"'}>${s.room.endsWith('/demo')?'예시 오픈채팅 링크가 열렸어요':'카카오 오픈채팅 들어가기'}</a>`;
  }
  if(s.stage==='closed')content='<h1>소개가 마무리됐어요.</h1><p>이 편지는 여기서 마칠게요.</p>';
  app.innerHTML=`<section class="solo" data-stage="${h(s.stage)}">${content}${!['closed','matched'].includes(s.stage)?'<button class="plain" id="no">이번 소개는 마칠게요</button>':''}</section>`;
  if(s.stage==='closed'||s.stage==='matched'&&s.ai)clearInterval(polling);
  const join=document.querySelector('#join');
  if(join)join.onsubmit=async e=>{e.preventDefault();const btn=join.querySelector('button');btn.disabled=true;try{await respond({action:'join',name:join.querySelector('#name').value,bio:join.querySelector('#bio').value,consent:join.querySelector('#consent').checked,photo:await resize(join.querySelector('#photo').files[0])});}catch(err){notice.textContent=errorText(err);}finally{btn.disabled=false;}};
  const yes=document.querySelector('#yes'),no=document.querySelector('#no');
  if(yes)yes.onclick=()=>respond({action:'accept'});
  if(no)no.onclick=()=>{if(confirm('이번 소개를 마칠까요? 이후 편지를 다시 열 수 없어요.'))respond({action:'decline'});};
}
home();
document.querySelector('.skip').onclick=e=>{e.preventDefault();document.querySelector('main').focus()};
