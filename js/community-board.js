/* ============================================================================
 *  IntMap · Community board: list, cards, compose and the map layer  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.communityBoard=function(map,HOST){
  /* (#R172) THROUGH IntMapGeoEngine — this module no longer names the renderer. */
  const _GE=()=>window.IntMapGeoEngine;
  const _LY=()=>{ const E=_GE(); return E?E.layers:null; };
  const _EV=()=>{ const E=_GE(); return E?E.events:null; };
  const _CM=()=>{ const E=_GE(); return E?E.camera:null; };
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  const commCatById=(id)=>HOST.COMM_CATEGORIES.find(c=>c.id===id)||HOST.COMM_CATEGORIES[0];
  const commCatLabel=(id)=>{ const c=commCatById(id); return c.label[HOST.lang]||c.label.en; };
  /* Deterministic avatar (colored initial) from a display name. */
  function commAvatar(name){
    const s=(name||'?').trim(); let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0;
    const hue=Math.abs(h)%360, init=HOST.escapeHtml(s.slice(0,/[A-Za-z0-9]/.test(s[0]||'')?2:1).toUpperCase()||'?');
    return `<span class="comm-avatar" style="background:hsl(${hue},58%,46%)">${init}</span>`;
  }
  /* Compact relative time ("5m", "3h", "2d" / 「5分前」). */
  function relTime(ts){
    const s=Math.max(0,(Date.now()-ts)/1000);
    if(HOST.lang==='jp'){
      if(s<60) return 'たった今'; if(s<3600) return Math.floor(s/60)+'分前'; if(s<86400) return Math.floor(s/3600)+'時間前';
      if(s<604800) return Math.floor(s/86400)+'日前'; if(s<2629800) return Math.floor(s/604800)+'週間前';
      return new Date(ts).toLocaleDateString('ja-JP');
    }
    if(s<60) return 'now'; if(s<3600) return Math.floor(s/60)+'m'; if(s<86400) return Math.floor(s/3600)+'h';
    if(s<604800) return Math.floor(s/86400)+'d'; if(s<2629800) return Math.floor(s/604800)+'w';
    return new Date(ts).toLocaleDateString('en-US');
  }
  /* "Hot" ranking — recent + upvoted + discussed floats to the top (Reddit-style decay). */
  function hotScore(p){ const ageH=(Date.now()-p.ts)/3.6e6; return ((p.votes||0)+0.5*((p.comments||[]).length)+1)/Math.pow(ageH+2,1.3); }
  function setupCommunityLayer(){
    if(!_imCanDraw()) return;
    if(!_LY()) return;   /* engine not built yet (#R172) — the caller retries */
    if(!_LY().hasSource('community-points')){
      /* Color pins by post category (falls back to green for un-categorised). */
      const catColor=['match',['get','cat']].concat(HOST.COMM_CATEGORIES.flatMap(c=>[c.id,c.color])).concat(['#34c759']);
      _LY().addSource('community-points',{type:'geojson',data:{type:'FeatureCollection',features:[]},promoteId:'fid'});
      _LY().add({id:'community-pulse',type:'circle',source:'community-points',paint:{
        'circle-radius':['interpolate',['linear'],['zoom'],0,8,4,14,10,20],
        'circle-color':catColor,'circle-opacity':0.2,'circle-stroke-width':0
      }});
      _LY().add({id:'community-dots',type:'circle',source:'community-points',paint:{
        'circle-radius':['case',['boolean',['feature-state','hover'],false],11,8],
        'circle-color':catColor,'circle-stroke-width':2.5,'circle-stroke-color':'#ffffff'
      }});
      _LY().add({id:'community-labels',type:'symbol',source:'community-points',layout:{
        'text-field':['get','short'],'text-size':11,'text-font':['literal',['Noto Sans Regular']],
        'text-anchor':'left','text-offset':[1.1,0],'text-allow-overlap':false,'text-optional':true,'text-max-width':14
      },paint:{'text-color':'#0a6b32','text-halo-color':'rgba(255,255,255,0.95)','text-halo-width':2.0,'text-opacity':0.95}});
      let hoverComm=null;
      _EV().onLayer('mousemove','community-dots',e=>{
        if(!e.features.length) return;
        _GE().render.setCursor('pointer');
        const f=e.features[0];
        if(hoverComm!==f.id){
          if(hoverComm!=null) try{_LY().setFeatureState({source:'community-points',id:hoverComm},{hover:false});}catch(_){}
          hoverComm=f.id;
          try{_LY().setFeatureState({source:'community-points',id:hoverComm},{hover:true});}catch(_){}
        }
        const el=HOST.ensureMapTooltip(); el.style.display='block';
        const p=f.properties;
        el.innerHTML=`<div style="color:#34c759;font-weight:600;font-size:13px;">💬 ${IntMapSafe.html(p.title)}</div><div style="line-height:1.4;margin-top:4px;color:var(--text-muted);font-size:11px;">${IntMapSafe.html(p.body||'')}</div>`;   /* (#R138 SEC) community post title/body are user-generated → escape (stored XSS on pin hover) */
        HOST.positionTooltip(e.point);
      });
      _EV().onLayer('mouseleave','community-dots',()=>{
        if(hoverComm!=null){ try{_LY().setFeatureState({source:'community-points',id:hoverComm},{hover:false});}catch(_){} hoverComm=null; }
        _GE().render.setCursor(''); if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none';
      });
      _EV().onLayer('click','community-dots',e=>{
        if(!e.features.length) return;
        const id=e.features[0].properties.fid;
        if(HOST.mode!=='community'){ HOST.setMode('community','btn-community'); }
        setTimeout(()=>{ const card=document.getElementById('comm-post-'+id); if(card) card.scrollIntoView({behavior:'smooth',block:'center'}); },200);
      });
    }
    HOST.pushCommunityFeatures();
  }
  /* Posts after the active search / category / in-view filters (drives both feed + pins). */
  function visibleCommunityPosts(){
    let list=HOST.communityPosts.slice();
    if(HOST.commCatFilter!=='all') list=list.filter(p=>(p.category||'general')===HOST.commCatFilter);
    if(HOST.commSearch){ const q=HOST.commSearch.toLowerCase(); list=list.filter(p=>((p.title||'')+' '+(p.body||'')+' '+(p.author||'')).toLowerCase().includes(q)); }
    if(HOST.commInView){ try{ const b=_CM().getBounds(); if(b) list=list.filter(p=>b.contains([p.lng,p.lat])); }catch(_){} }
    return list;
  }
  /* Escape + auto-link URLs (body/comment text). */
  function linkify(s){ return HOST.escapeHtml(s||'').replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener" class="comm-link">$1</a>'); }
  /* Fills only #comm-list (so the search box above never loses focus while typing). */
  function renderCommList(){
    const list=document.getElementById('comm-list'); if(!list) return;
    const posts=visibleCommunityPosts();
    posts.sort((a,b)=> HOST.communitySort==='top' ? (((b.votes||0)-(a.votes||0))||(b.ts-a.ts))
                     : HOST.communitySort==='hot' ? (hotScore(b)-hotScore(a))
                     : (b.ts-a.ts));
    if(HOST.communityPosts.length===0) list.innerHTML=`<div class="empty-msg">${HOST.t('commEmpty')}</div>`;
    else if(posts.length===0)     list.innerHTML=`<div class="empty-msg">${HOST.t('commNoMatch')}</div>`;
    else                          list.innerHTML=posts.map(postCardHTML).join('');
    HOST.wireCommList(list);
    try{ HOST.pushCommunityFeatures(); }catch(_){}
  }
  function postCardHTML(post){
    const jp=HOST.lang==='jp', mine=HOST.user&&post.userId===HOST.user.id;
    const canDel = HOST.user && (mine || HOST.user.isAdmin);
    const cat=commCatById(post.category||'general');
    const imgHtml=post.img?`<img class="comm-post-img" src="${IntMapSafe.html(IntMapSafe.url(post.img,{allowData:true}))}" data-id="${post.id}" alt="">`:'';   /* (#R138 SEC) post.img is user-controlled (direct Supabase insert) → scheme-validate + quote-escape (stored XSS, auto-fires on feed render) */
    const edited=post.editedTs?` · <span class="comm-edited">${HOST.t('commEdited')}</span>`:'';
    const cmts=post.comments||[];
    return `<div class="comm-post" id="comm-post-${post.id}">
      <div class="comm-post-top">
        <span class="comm-author-link" data-uid="${post.userId||''}" data-author="${HOST.escapeHtml(post.author||'')}" style="display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0;flex:1;">
        ${commAvatar(post.author)}
        <div class="comm-post-idn">
          <div class="comm-post-author">${HOST.escapeHtml(post.author||(jp?'匿名':'Anonymous'))}</div>
          <div class="comm-post-sub">${relTime(post.ts)}${edited} · <span class="comm-post-loc" data-lat="${post.lat}" data-lng="${post.lng}">📍 ${post.lat.toFixed(1)}°, ${post.lng.toFixed(1)}°</span></div>
        </div></span>
        <span class="comm-cat-tag" style="--cc:${cat.color}">${cat.emoji} ${commCatLabel(post.category||'general')}</span>
      </div>
      ${post.title?`<div class="comm-post-title">${HOST.escapeHtml(post.title)}</div>`:''}
      ${imgHtml}
      ${post.body?`<div class="comm-post-body">${linkify(post.body)}</div>`:''}
      <div class="comm-post-actions">
        <button class="vote-btn ${post.voted?'voted':''}" data-id="${post.id}" title="${jp?'役に立った':'Upvote'}">▲ ${post.votes||0}</button>
        <button class="cmt-toggle" data-id="${post.id}">💬 ${cmts.length}</button>
        <button class="locate-btn" data-id="${post.id}">🌐 ${HOST.t('commLocate')}</button>
        ${mine?`<button class="edit-btn" data-id="${post.id}">${HOST.t('commEdit')}</button>`:''}
        <button class="report-btn" data-id="${post.id}" title="${jp?'通報':'Report'}">⚑</button>
        ${canDel?`<button class="del-btn" data-id="${post.id}">${HOST.t('commDelete')}</button>`:''}
      </div>
      <div class="comm-comments ${HOST.commCollapsed[post.id]?'collapsed':''}" data-cwrap="${post.id}">
        ${threadHTML(post)}
        ${HOST.user?`<div class="comm-comment-add">
          <input type="text" placeholder="${HOST.t('commWrite')}" data-pid="${post.id}" maxlength="280">
          <button data-pid="${post.id}">${HOST.t('commPost')}</button></div>`:''}
      </div>
    </div>`;
  }
  function threadHTML(post){
    const cmts=post.comments||[]; if(!cmts.length) return '';
    const byId={}; cmts.forEach(c=>byId[c.id]=c);
    const rootOf=(c)=>{ let cur=c,hop=0; while(cur.parentId&&byId[cur.parentId]&&hop<8){ cur=byId[cur.parentId]; hop++; } return cur; };
    const roots=cmts.filter(c=>!c.parentId||!byId[c.parentId]).sort((a,b)=>a.ts-b.ts);
    return roots.map(r=>{
      const kids=cmts.filter(c=>c.parentId&&c.id!==r.id&&rootOf(c).id===r.id).sort((a,b)=>a.ts-b.ts);
      return commentHTML(r,false)+kids.map(k=>commentHTML(k,true)).join('');
    }).join('');
  }
  function commentHTML(c,isReply){
    const mine=HOST.user&&c.userId===HOST.user.id, canDel=HOST.user&&(mine||HOST.user.isAdmin);
    const edited=c.editedTs?` · ${HOST.t('commEdited')}`:'';
    const cv=HOST.commCaps&&HOST.commCaps.commentVotes, th=HOST.commCaps&&HOST.commCaps.threads;
    return `<div class="comm-comment ${isReply?'reply':''}" id="comm-c-${c.id}">
      <div class="comm-comment-meta">${commAvatar(c.author)} <b>${HOST.escapeHtml(c.author||'')}</b> · ${relTime(c.ts)}${edited}</div>
      <div class="comm-comment-body">${linkify(c.text)}</div>
      <div class="comm-comment-actions">
        ${cv?`<button class="cvote-btn ${c.voted?'voted':''}" data-cid="${c.id}">▲ ${c.votes||0}</button>`:''}
        ${th&&HOST.user?`<button class="creply-btn" data-cid="${c.id}" data-pid="${c.postId}">${HOST.t('commReply')}</button>`:''}
        ${mine?`<button class="cedit-btn" data-cid="${c.id}">${HOST.t('commEdit')}</button>`:''}
        ${canDel?`<button class="cdel-btn" data-cid="${c.id}">${HOST.t('commDelete')}</button>`:''}
      </div>
    </div>`;
  }
  function renderComposeCats(){
    const wrap=document.getElementById('compose-cats'); if(!wrap) return;
    wrap.innerHTML=HOST.COMM_CATEGORIES.map(c=>`<button type="button" class="comm-cat-chip ${HOST.composeCat===c.id?'active':''}" data-cc="${c.id}" style="--cc:${c.color}">${c.emoji} ${commCatLabel(c.id)}</button>`).join('');
    wrap.querySelectorAll('[data-cc]').forEach(b=>b.onclick=()=>{ HOST.composeCat=b.dataset.cc; renderComposeCats(); });
  }
  function openComposeModal(editPost){
    const m=document.getElementById('compose-modal'), jp=HOST.lang==='jp';
    HOST.composeEditId = editPost ? editPost.id : null;
    HOST.composeCat = editPost ? (editPost.category||'general') : 'general';
    if(editPost) HOST.pendingPostLoc=[editPost.lng,editPost.lat];
    document.getElementById('compose-title').textContent = editPost ? HOST.t('commEditPost') : HOST.t('commPostNew');
    document.getElementById('compose-post-title').value = editPost ? (editPost.title||'') : '';
    document.getElementById('compose-post-body').value = editPost ? (editPost.body||'') : '';
    document.getElementById('compose-post-title').placeholder=HOST.t('commTitle');
    document.getElementById('compose-post-body').placeholder=HOST.t('commBody');
    document.getElementById('compose-cancel').textContent=HOST.t('commCancel');
    document.getElementById('compose-submit').textContent = editPost ? HOST.t('commSaveEdit') : HOST.t('commPost');
    HOST.pendingImg = editPost ? (editPost.img||'') : ''; HOST.showComposeImgPreview(HOST.pendingImg);
    document.getElementById('compose-img-label').textContent=jp?'画像を追加':'Add image';
    document.getElementById('compose-place-label').textContent=jp?'地図でピンを移動':'Move pin on map';
    /* Category picker — shown unless schema-detection proved the column is missing. */
    const showCat = !HOST.commCaps || HOST.commCaps.category;
    const catLabel=document.getElementById('compose-cat-label'), catWrap=document.getElementById('compose-cats');
    if(catLabel){ catLabel.textContent=HOST.t('commCat'); catLabel.style.display=showCat?'block':'none'; }
    if(catWrap){ catWrap.style.display=showCat?'flex':'none'; if(showCat) renderComposeCats(); }
    if(HOST.pendingPostLoc){
      document.getElementById('compose-coord-hint').textContent=
        `${HOST.t('commPlacedAt')}: ${HOST.pendingPostLoc[1].toFixed(3)}°, ${HOST.pendingPostLoc[0].toFixed(3)}°`;
    } else {
      document.getElementById('compose-coord-hint').textContent=
        jp?'地図をクリックして位置を指定してください。':'Click on the map to place a location.';
    }
    m.classList.add('active');
  }
  /* Public profile card (#28) — tap a community author to see their name, avatar & bio. */
  async function imViewProfile(uid,author){
    let m=document.getElementById('profile-modal');
    if(!m){ m=document.createElement('div'); m.id='profile-modal'; m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:5200;padding:20px;'; m.onclick=e=>{ if(e.target===m) m.style.display='none'; }; document.body.appendChild(m); }
    let bio='', avatar='', name=author||'';
    if(uid && HOST.DB){ try{
      /* (#R134) Read the PUBLIC-safe projection (profiles_public = id/display_name/bio/avatar_url only) so a
         viewer never receives another user's email/is_admin/plan. Falls back to profiles for a database that
         has not applied the profiles_public view yet (forward+backward compatible with the DB migration). */
      let r=await HOST.DB.from('profiles_public').select('display_name,bio,avatar_url').eq('id',uid).maybeSingle();
      if(r.error) r=await HOST.DB.from('profiles').select('display_name,bio,avatar_url').eq('id',uid).maybeSingle();
      const data=r.data; if(data){ name=data.display_name||name; bio=data.bio||''; avatar=data.avatar_url||''; }
    }catch(_){} }
    let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))|0;
    const ava = avatar?`<div style="width:66px;height:66px;border-radius:50%;background:url('${IntMapSafe.html(IntMapSafe.url(avatar,{allowData:true}))}') center/cover;margin:0 auto 10px;"></div>`:`<div style="width:66px;height:66px;border-radius:50%;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:27px;font-weight:700;color:#fff;background:hsl(${Math.abs(h)%360},58%,46%)">${HOST.escapeHtml((name[0]||'?').toUpperCase())}</div>`;   /* (#R138 SEC) another user's avatar_url is attacker-controllable → scheme-validate + quote-escape (stored XSS via CSS background breakout) */
    m.innerHTML=`<div style="background:var(--card-bg);color:var(--text-main);border-radius:16px;box-shadow:var(--shadow);padding:24px;width:100%;max-width:320px;text-align:center;">${ava}<h2 style="margin:0 0 6px;font-size:18px;">${HOST.escapeHtml(name||'?')}</h2><p style="color:var(--text-muted);font-size:13px;line-height:1.55;white-space:pre-wrap;margin:0 0 16px;">${bio?HOST.escapeHtml(bio):(HOST.lang==='jp'?'自己紹介はまだありません。':HOST.lang==='de'?'Noch keine Bio.':HOST.lang==='ru'?'Пока без описания.':HOST.lang==='es'?'Aún sin biografía.':'No bio yet.')}</p><button id="pm-close" style="width:100%;background:var(--input-bg);color:var(--text-main);border:none;padding:10px;border-radius:9px;font-weight:600;cursor:pointer;">${HOST.lang==='jp'?'閉じる':HOST.lang==='de'?'Schließen':HOST.lang==='ru'?'Закрыть':HOST.lang==='es'?'Cerrar':'Close'}</button></div>`;
    m.querySelector('#pm-close').onclick=()=>{ m.style.display='none'; };
    m.style.display='flex';
  }
  /* Detect which v2 columns/tables exist so the UI degrades gracefully on an un-migrated DB.
     (Same tolerant pattern as refreshCurrentUser's is_pro probe.) Runs once, then cached. */
  async function detectCommCaps(){
    if(HOST.commCaps) return HOST.commCaps;
    const caps={ category:false, threads:false, commentVotes:false, edited:false };
    if(HOST.DB){
      const ok=async(tbl,cols)=>{ try{ const {error}=await HOST.DB.from(tbl).select(cols).limit(1); return !error; }catch(_){ return false; } };
      const postsRich=await ok('community_posts','id,category,edited_at');
      caps.category = postsRich || await ok('community_posts','id,category');
      const cmtsRich = await ok('community_comments','id,parent_id,edited_at');
      caps.threads = cmtsRich || await ok('community_comments','id,parent_id');
      caps.commentVotes = await ok('community_comment_votes','comment_id');
      caps.edited = postsRich && cmtsRich;
    }
    HOST.commCaps=caps; return caps;
  }
  function commSelectStr(){
    const c=HOST.commCaps||{};
    const pExtra=(c.category?',category':'')+(c.edited?',edited_at':'');
    const cExtra=(c.threads?',parent_id':'')+(c.edited?',edited_at':'')+(c.commentVotes?',community_comment_votes(user_id)':'');
    return `id,user_id,author_name,title,body,img,lat,lng,created_at${pExtra},community_comments(id,user_id,author_name,body,created_at${cExtra}),community_votes(user_id)`;
  }
  const LEGACY_COMM_SELECT='id,user_id,author_name,title,body,img,lat,lng,created_at,community_comments(id,user_id,author_name,body,created_at),community_votes(user_id)';
  async function loadCommunity(){
    if(!HOST.DB){ HOST.communityPosts=[]; HOST.renderCommunity(); return; }
    await detectCommCaps();
    const uid=HOST.user?HOST.user.id:null;
    let res=await HOST.DB.from('community_posts').select(commSelectStr()).order('created_at',{ascending:false});
    if(res.error){ /* rich select failed (partial migration) → fall back to the legacy shape */
      HOST.commCaps={category:false,threads:false,commentVotes:false,edited:false};
      res=await HOST.DB.from('community_posts').select(LEGACY_COMM_SELECT).order('created_at',{ascending:false});
    }
    if(res.error){ console.warn('[IntMap] community load:', res.error.message); HOST.communityPosts=[]; HOST.renderCommunity(); return; }
    HOST.communityPosts=(res.data||[]).map(p=>({
      id:p.id, userId:p.user_id, title:p.title||'', body:p.body||'', img:p.img||'', lat:p.lat, lng:p.lng,
      ts:Date.parse(p.created_at)||Date.now(), editedTs:p.edited_at?Date.parse(p.edited_at):0,
      author:p.author_name||'', category:p.category||'general',
      votes:(p.community_votes||[]).length,
      voted: uid?(p.community_votes||[]).some(v=>v.user_id===uid):false,
      comments:(p.community_comments||[]).slice().sort((a,b)=>(Date.parse(a.created_at)||0)-(Date.parse(b.created_at)||0))
                .map(c=>({ id:c.id, postId:p.id, userId:c.user_id, text:c.body, author:c.author_name||'',
                          ts:Date.parse(c.created_at)||Date.now(), editedTs:c.edited_at?Date.parse(c.edited_at):0,
                          parentId:c.parent_id||null,
                          votes:(c.community_comment_votes||[]).length,
                          voted: uid?(c.community_comment_votes||[]).some(v=>v.user_id===uid):false }))
    }));
    HOST.pushCommunityFeatures(); HOST.renderCommunity();
  }
  async function cmAddPost(title,body,img,lat,lng,category){
    const row={ user_id:HOST.user.id, author_name:HOST.user.name, title:title||null, body:body||null, img:img||null, lat, lng };
    if(HOST.commCaps&&HOST.commCaps.category&&category) row.category=category;
    let {error}=await HOST.DB.from('community_posts').insert(row);
    if(error && row.category!==undefined){ delete row.category; ({error}=await HOST.DB.from('community_posts').insert(row)); } /* retry w/o category if column missing */
    if(error) throw error;
  }
  async function cmEditPost(id,f){
    const patch={ title:f.title||null, body:f.body||null, img:f.img||null, lat:f.lat, lng:f.lng };
    if(HOST.commCaps&&HOST.commCaps.category) patch.category=f.category||'general';
    if(HOST.commCaps&&HOST.commCaps.edited) patch.edited_at=new Date().toISOString();
    const {error}=await HOST.DB.from('community_posts').update(patch).eq('id',id); if(error) throw error;
  }
  return { cmAddPost, cmEditPost, commCatLabel, imViewProfile, loadCommunity, openComposeModal, renderCommList, setupCommunityLayer, visibleCommunityPosts };
};
