/* ============================================================================
 *  IntMap · Community feed  (#R168)
 * ----------------------------------------------------------------------------
 *  The community feed renderer and its list wiring, plus the comment/vote/report mutations.
 *  The filter and compose state it drives stays declared in index.html and is written through
 *  the host, so index.html and this module always read the same live values.
 *
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure: the only edit is that free
 *  references to closure variables became HOST.<member> reads (Architecture.md §3.1). The
 *  extraction was done by script and reversed byte-for-byte against the original text.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.community=function(map,HOST){
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  function openImageLightbox(src){
    const old=document.getElementById('img-lightbox'); if(old) old.remove();
    const lb=document.createElement('div'); lb.id='img-lightbox';
    const im=document.createElement('img'); im.src=src; lb.appendChild(im);
    lb.onclick=()=>lb.remove();
    document.addEventListener('keydown',function esc(e){ if(e.key==='Escape'){ lb.remove(); document.removeEventListener('keydown',esc); } });
    document.body.appendChild(lb);
  }

  function renderCommunity(){
    const cont=document.getElementById('community-feed');
    if(_imCanDraw()) HOST.setupCommunityLayer();
    const jp=HOST.lang==='jp';
    const sortBtn=(k,lbl)=>`<button data-sort="${k}" class="${HOST.communitySort===k?'active':''}">${lbl}</button>`;
    const catChip=(id,lbl,color)=>`<button class="comm-cat-chip ${HOST.commCatFilter===id?'active':''}" data-catf="${id}" style="--cc:${color}">${lbl}</button>`;
    const loginHint = HOST.user ? '' : `<div class="empty-msg" style="padding:10px 16px;">${jp?'投稿・コメント・投票するにはログインしてください。':'Log in to post, comment and vote.'}</div>`;
    /* New post + Hot/New/Top are a STICKY BOTTOM bar, always visible while the feed scrolls (#27). */
    cont.innerHTML=`<div class="comm-scroll" id="comm-scroll">
        <div class="comm-filters">
          <div class="comm-search"><span>🔎</span><input type="text" id="comm-search" placeholder="${HOST.t('commSearchPh')}" value="${HOST.escapeHtml(HOST.commSearch)}"></div>
          <button class="comm-inview ${HOST.commInView?'active':''}" id="comm-inview" title="${jp?'地図の表示範囲内の投稿だけ':'Only posts in the current map view'}">🧭 ${HOST.t('commInView')}</button>
        </div>
        <div class="comm-cat-row">
          ${catChip('all',HOST.t('commCatAll'),'var(--primary-color)')}
          ${HOST.COMM_CATEGORIES.map(c=>catChip(c.id,c.emoji+' '+HOST.commCatLabel(c.id),c.color)).join('')}
        </div>${loginHint}
        <div id="comm-list"></div>
      </div>
      <div class="comm-toolbar comm-toolbar-bottom">
        <button class="comm-add-btn" id="comm-add-btn">${HOST.t('commAdd')}</button>
        <div class="comm-sort">${sortBtn('hot',HOST.t('commSortHot'))}${sortBtn('new',HOST.t('commSortNew'))}${sortBtn('top',HOST.t('commSortTop'))}</div>
      </div>`;
    /* Toolbar wiring (rebuilds list on change — search updates list only, so its input keeps focus). */
    document.getElementById('comm-add-btn').onclick=()=>{
      if(!HOST.requireLogin()) return;
      /* (#R16) "コミュニティで投稿するときは、まず初めに場所を選ばせろ" — pick the location on the map FIRST.
         Arm a one-shot map tap (the communityAddArmed handler opens the composer at the tapped point); on
         mobile collapse the sheet so the map is reachable, and guide with a toast. */
      HOST.pendingPostLoc=null; HOST.communityAddArmed=true;
      try{ if(window.matchMedia&&window.matchMedia('(max-width:768px)').matches && window.__setDetent) window.__setDetent('peek',true); }catch(_){}   /* (#R107) 'mini' disabled → collapse to 'peek' (still frees the map) */
      HOST.imToast(HOST.lang==='jp'?'📍 地図をタップして投稿する場所を選んでください':HOST.lang==='de'?'📍 Tippe auf die Karte, um den Ort des Beitrags zu wählen':HOST.lang==='ru'?'📍 Коснитесь карты, чтобы выбрать место публикации':HOST.lang==='es'?'📍 Toca el mapa para elegir dónde publicar':'📍 Tap the map to choose where to post');
    };
    cont.querySelectorAll('.comm-sort button').forEach(b=>b.onclick=()=>{ HOST.communitySort=b.dataset.sort; renderCommunity(); });
    cont.querySelectorAll('.comm-cat-chip').forEach(b=>b.onclick=()=>{ HOST.commCatFilter=b.dataset.catf; renderCommunity(); });
    document.getElementById('comm-inview').onclick=()=>{ HOST.commInView=!HOST.commInView; renderCommunity(); };
    const si=document.getElementById('comm-search');
    if(si) si.addEventListener('input',()=>{ HOST.commSearch=si.value; clearTimeout(renderCommunity._st); renderCommunity._st=setTimeout(HOST.renderCommList,160); });
    HOST.renderCommList();
  }

  const _findComment=(cid)=>{ for(const p of HOST.communityPosts){ const c=(p.comments||[]).find(x=>x.id===cid); if(c) return c; } return null; };

  /* Per-card event wiring (run after every list render). */
  function wireCommList(cont){
    cont.querySelectorAll('.comm-post-loc').forEach(el=>el.onclick=()=>{ if(map) map.flyTo({center:[+el.dataset.lng,+el.dataset.lat],zoom:5,speed:1.2}); });
    cont.querySelectorAll('.locate-btn').forEach(b=>b.onclick=()=>{ const p=HOST.communityPosts.find(p=>p.id===b.dataset.id); if(p&&map) map.flyTo({center:[p.lng,p.lat],zoom:5,speed:1.2}); });
    cont.querySelectorAll('.cmt-toggle').forEach(b=>b.onclick=()=>{ const id=b.dataset.id; HOST.commCollapsed[id]=!HOST.commCollapsed[id]; const w=cont.querySelector(`[data-cwrap="${id}"]`); if(w) w.classList.toggle('collapsed',!!HOST.commCollapsed[id]); });
    cont.querySelectorAll('.comm-post-img').forEach(im=>im.onclick=()=>openImageLightbox(im.src));
    cont.querySelectorAll('.vote-btn').forEach(b=>b.onclick=async()=>{
      if(!HOST.requireLogin()) return; const p=HOST.communityPosts.find(p=>p.id===b.dataset.id); if(!p) return;
      try{ await cmVote(p.id,!p.voted); }catch(e){ HOST.imToast((e&&e.message)||'Vote failed'); return; } await HOST.loadCommunity();
    });
    cont.querySelectorAll('.edit-btn').forEach(b=>b.onclick=()=>{ const p=HOST.communityPosts.find(p=>p.id===b.dataset.id); if(p) HOST.openComposeModal(p); });
    cont.querySelectorAll('.del-btn').forEach(b=>b.onclick=async()=>{
      if(!confirm(HOST.lang==='jp'?'この投稿を削除しますか？':HOST.lang==='de'?'Diesen Beitrag löschen?':HOST.lang==='ru'?'Удалить эту публикацию?':HOST.lang==='es'?'¿Eliminar esta publicación?':'Delete this post?')) return;
      try{ await cmDelete(b.dataset.id); }catch(e){ HOST.imToast((e&&e.message)||'Delete failed'); return; } await HOST.loadCommunity();
    });
    cont.querySelectorAll('.report-btn').forEach(b=>b.onclick=async()=>{
      if(!HOST.requireLogin()) return;
      if(!confirm(HOST.lang==='jp'?'この投稿を不適切として通報しますか？':HOST.lang==='de'?'Diesen Beitrag als unangemessen melden?':HOST.lang==='ru'?'Пожаловаться на эту публикацию?':HOST.lang==='es'?'¿Denunciar esta publicación como inapropiada?':'Report this post as inappropriate?')) return;
      try{ await cmReport(b.dataset.id); HOST.imToast(HOST.lang==='jp'?'通報しました。ご協力ありがとうございます。':HOST.lang==='de'?'Gemeldet. Danke.':HOST.lang==='ru'?'Жалоба отправлена. Спасибо.':HOST.lang==='es'?'Denunciado. Gracias.':'Reported. Thank you.'); }catch(e){ HOST.imToast((e&&e.message)||'Report failed'); }
    });
    /* Add comment / reply */
    const submitComment=async(b)=>{
      if(!HOST.requireLogin()) return; const input=b.previousElementSibling, txt=input.value.trim(); if(!txt) return;
      const pid=b.dataset.pid, parent=(HOST.replyingTo&&HOST.replyingTo.pid===pid)?HOST.replyingTo.cid:null;
      input.value=''; HOST.replyingTo=null;
      try{ await cmComment(pid,txt,parent); }catch(e){ HOST.imToast((e&&e.message)||'Comment failed'); return; } await HOST.loadCommunity();
    };
    cont.querySelectorAll('.comm-comment-add button').forEach(b=>b.onclick=()=>submitComment(b));
    cont.querySelectorAll('.comm-comment-add input').forEach(inp=>inp.addEventListener('keydown',e=>{ if(e.key==='Enter') inp.nextElementSibling.click(); }));
    /* Reply: focus this post's comment box and remember the parent comment. */
    cont.querySelectorAll('.creply-btn').forEach(b=>b.onclick=()=>{
      const pid=b.dataset.pid, cid=b.dataset.cid, c=_findComment(cid);
      HOST.replyingTo={pid,cid};
      const box=cont.querySelector(`.comm-comment-add input[data-pid="${pid}"]`);
      if(box){ box.placeholder=(HOST.lang==='jp'?'返信: ':HOST.lang==='de'?'Antwort an ':HOST.lang==='ru'?'Ответ: ':HOST.lang==='es'?'Responder a ':'Reply to ')+(c?c.author:'')+' …'; box.focus(); }
    });
    /* Comment upvote */
    cont.querySelectorAll('.cvote-btn').forEach(b=>b.onclick=async()=>{
      if(!HOST.requireLogin()) return; const c=_findComment(b.dataset.cid); if(!c) return;
      try{ await cmVoteComment(c.id,!c.voted); }catch(e){ HOST.imToast((e&&e.message)||'Vote failed'); return; } await HOST.loadCommunity();
    });
    /* Comment edit (inline prompt) */
    cont.querySelectorAll('.cedit-btn').forEach(b=>b.onclick=async()=>{
      const c=_findComment(b.dataset.cid); if(!c) return;
      const v=prompt(HOST.lang==='jp'?'コメントを編集':HOST.lang==='de'?'Kommentar bearbeiten':HOST.lang==='ru'?'Изменить комментарий':HOST.lang==='es'?'Editar comentario':'Edit comment',c.text); if(v==null) return;
      const nv=v.trim(); if(!nv||nv===c.text) return;
      try{ await cmEditComment(c.id,nv); }catch(e){ HOST.imToast((e&&e.message)||'Edit failed'); return; } await HOST.loadCommunity();
    });
    /* Comment delete */
    cont.querySelectorAll('.cdel-btn').forEach(b=>b.onclick=async()=>{
      if(!confirm(HOST.lang==='jp'?'このコメントを削除しますか？':HOST.lang==='de'?'Diesen Kommentar löschen?':HOST.lang==='ru'?'Удалить этот комментарий?':HOST.lang==='es'?'¿Eliminar este comentario?':'Delete this comment?')) return;
      try{ await cmDeleteComment(b.dataset.cid); }catch(e){ HOST.imToast((e&&e.message)||'Delete failed'); return; } await HOST.loadCommunity();
    });
  }

  async function cmComment(postId,text,parentId){
    const row={ post_id:postId, user_id:HOST.user.id, author_name:HOST.user.name, body:text };
    if(parentId && HOST.commCaps&&HOST.commCaps.threads) row.parent_id=parentId;
    let {error}=await HOST.DB.from('community_comments').insert(row);
    if(error && row.parent_id){ delete row.parent_id; ({error}=await HOST.DB.from('community_comments').insert(row)); }
    if(error) throw error;
  }

  async function cmEditComment(id,text){
    const patch={ body:text };
    if(HOST.commCaps&&HOST.commCaps.edited) patch.edited_at=new Date().toISOString();
    const {error}=await HOST.DB.from('community_comments').update(patch).eq('id',id); if(error) throw error;
  }

  async function cmDeleteComment(id){ const {error}=await HOST.DB.from('community_comments').delete().eq('id',id); if(error) throw error; }

  async function cmVoteComment(id,on){
    if(on){ const {error}=await HOST.DB.from('community_comment_votes').insert({ comment_id:id, user_id:HOST.user.id }); if(error && error.code!=='23505') throw error; }
    else { const {error}=await HOST.DB.from('community_comment_votes').delete().eq('comment_id',id).eq('user_id',HOST.user.id); if(error) throw error; }
  }

  async function cmVote(postId,on){
    if(on){ const {error}=await HOST.DB.from('community_votes').insert({ post_id:postId, user_id:HOST.user.id }); if(error && error.code!=='23505') throw error; }
    else { const {error}=await HOST.DB.from('community_votes').delete().eq('post_id',postId).eq('user_id',HOST.user.id); if(error) throw error; }
  }

  async function cmDelete(postId){ const {error}=await HOST.DB.from('community_posts').delete().eq('id',postId); if(error) throw error; }

  async function cmReport(postId){ const {error}=await HOST.DB.from('community_reports').insert({ post_id:postId, user_id:HOST.user.id }); if(error && error.code!=='23505') throw error; }

  /* The names index.html still calls: it keeps a hoisted shim for each (#R168). */
  return { renderCommunity, wireCommList };
};
