'use client';
import {useEffect,useRef,useState} from 'react';
import {BookObject} from './book';
import {Plus,RotateCcw,Save,Send,Sun,Trash2} from 'lucide-react';
type ObjectItem={id:string;type:'shelf'|'chair'|'plant'|'lamp'|'art'|'book';x:number;y:number;rotation:number;scale?:number;color:string;copyId?:string};
type Scene={light:number;objects:ObjectItem[]};
const starter:Scene={light:75,objects:[]};
export function RoomScene({scene,name,mood,books,selected,onSelect,onPointerDown,onPointerMove,emptyMessage}:{scene:Scene;name:string;mood:string;books:any[];selected?:string|null;onSelect?:(id:string)=>void;onPointerDown?:(event:React.PointerEvent<HTMLButtonElement>,id:string)=>void;onPointerMove?:(event:React.PointerEvent<HTMLButtonElement>,id:string)=>void;emptyMessage?:string}) {
  return <div className={`room-canvas ${mood}`} style={{'--room-light':scene.light/100} as React.CSSProperties} aria-label={`${name} room scene`}>
    <div className="room-wall"><div className="room-title">{name}</div></div><div className="room-floor"/>
    {scene.objects.map(obj=>{const book=books.find(b=>b.id===obj.copyId);return <button key={obj.id} disabled={!onSelect} className={`room-item ${obj.type} ${selected===obj.id?'selected':''}`} style={{'--object-color':obj.color,left:`${obj.x}%`,top:`${obj.y}%`,transform:`translate(-50%,-50%) rotate(${obj.rotation}deg) scale(${obj.scale??1})`} as React.CSSProperties} onClick={()=>onSelect?.(obj.type==='book'?obj.copyId??obj.id:obj.id)} onPointerDown={event=>onPointerDown?.(event,obj.id)} onPointerMove={event=>onPointerMove?.(event,obj.id)} aria-label={obj.type==='book'?`Inspect ${book?.title??'book'}`:`${obj.type} decoration`}>
      {obj.type==='book'?<BookObject title={book?.title??'Book'} author={book?.author} photo={book?.front_photo?`/api/media/${book.front_photo}`:null} interactive={false}/>:obj.type==='shelf'?<span className="furniture shelf-shape"/>:obj.type==='chair'?<span className="furniture chair-shape">◕</span>:obj.type==='plant'?<span className="furniture plant-shape">♣</span>:obj.type==='lamp'?<span className="furniture lamp-shape">✧</span>:<span className="furniture art-shape">✳</span>}
    </button>})}
    {scene.objects.length===0&&<div className="room-empty">{emptyMessage??'This Room has no objects yet.'}</div>}
  </div>;
}
export function RoomEditor({room,copies,revisions,onAction,notice}:{room:any;copies:any[];revisions:any[];onAction:(a:string,p:any)=>Promise<unknown>;notice:(m:string)=>void}) {
  const [scene,setScene]=useState<Scene>(room?.draft??starter),[history,setHistory]=useState<Scene[]>([]);
  const [name,setName]=useState(room?.name??'My Room'),[mood,setMood]=useState(room?.mood??'study'),[selected,setSelected]=useState<string|null>(null),[preview,setPreview]=useState(false),[saveState,setSaveState]=useState<'saved'|'unsaved'|'saving'|'failed'|'conflict'>('saved');
  const draftVersion=useRef(room?.draft_version??0),revision=useRef(0),savedRevision=useRef(0),inFlight=useRef<Promise<boolean>|null>(null);
  const latest=useRef({scene,name,mood});latest.current={scene,name,mood};
  useEffect(()=>{setScene(room?.draft??starter);setName(room?.name??'My Room');setMood(room?.mood??'study');draftVersion.current=room?.draft_version??0;revision.current=0;savedRevision.current=0;setSaveState('saved')},[room?.id]);
  const markDirty=()=>{revision.current++;setSaveState('unsaved')};
  const change=(next:Scene)=>{setHistory(h=>[...h.slice(-29),scene]);setScene(next);markDirty()};
  const save=async():Promise<boolean>=>{
    if(inFlight.current){const success=await inFlight.current;return success && revision.current>savedRevision.current?save():success;}
    if(revision.current===savedRevision.current)return true;
    const sentRevision=revision.current,snapshot=latest.current;
    setSaveState('saving');
    const pending=onAction('room.save',{...snapshot,baseVersion:draftVersion.current}).then((result:any)=>{
      draftVersion.current=result.draftVersion;savedRevision.current=sentRevision;
      setSaveState(revision.current===sentRevision?'saved':'unsaved');return true;
    }).catch((error:Error)=>{setSaveState(error.message.includes('another tab')?'conflict':'failed');return false}).finally(()=>{inFlight.current=null});
    inFlight.current=pending;return pending;
  };
  useEffect(()=>{if(saveState!=='unsaved')return;const timer=setTimeout(()=>{void save()},900);return()=>clearTimeout(timer)},[scene,name,mood,saveState]);
  const eligibleCopies=copies.filter(c=>c.owner_id===room?.user_id||c.holder_id===room?.user_id);
  const exportDraft=()=>{const blob=new Blob([JSON.stringify(latest.current,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='bookbonds-unsaved-room.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)};
  const restore=async(version:number)=>{
    if(saveState!=='saved')return;
    try {
      const result=await onAction('room.restore',{version,baseVersion:draftVersion.current}) as {draftVersion:number;scene:Scene;name:string;mood:string};
      draftVersion.current=result.draftVersion;setScene(result.scene);setName(result.name);setMood(result.mood);
      setHistory([]);revision.current=0;savedRevision.current=0;setSaveState('saved');notice(`Restored draft revision ${version}`);
    } catch { setSaveState('conflict'); }
  };
  const add=(type:ObjectItem['type'],copyId?:string)=>change({...scene,objects:[...scene.objects,{id:crypto.randomUUID(),type,x:30+Math.random()*35,y:35+Math.random()*30,rotation:0,scale:1,color:'#805d42',copyId}]});
  const update=(id:string,patch:Partial<ObjectItem>)=>change({...scene,objects:scene.objects.map(o=>o.id===id?{...o,...patch}:o)});
  const active=scene.objects.find(o=>o.id===selected);
  const dragStart=(event:React.PointerEvent<HTMLButtonElement>,objectId:string)=>{if(preview)return;event.currentTarget.setPointerCapture(event.pointerId);setSelected(objectId);setHistory(h=>[...h.slice(-29),scene])};
  const dragMove=(event:React.PointerEvent<HTMLButtonElement>,objectId:string)=>{if(!event.currentTarget.hasPointerCapture(event.pointerId)||preview)return;const rect=event.currentTarget.parentElement?.getBoundingClientRect();if(!rect)return;
    const x=Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)),y=Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100));
    setScene(current=>({...current,objects:current.objects.map(o=>o.id===objectId?{...o,x,y}:o)}));markDirty();};
  return <div className="room-workspace"><div className="room-header"><div><p className="eyebrow">YOUR SPATIAL LIBRARY</p><h2>Reader’s Room</h2><p>Build a place for your books. Publish only when it feels right.</p><p role="status">Draft: {saveState}{saveState==='conflict'?' — export your changes before reloading.':''}</p>{['failed','conflict'].includes(saveState)&&<div className="row wrap"><button className="button outline" onClick={exportDraft}>Export unsaved draft</button>{saveState==='failed'&&<button className="button outline" onClick={()=>void save()}>Retry save</button>}</div>}</div><div className="row wrap"><button className="button subtle" onClick={()=>setPreview(!preview)}>{preview?'Back to decorate':'Visitor preview'}</button><button className="button subtle" onClick={()=>void save()} disabled={saveState==='saving'||saveState==='conflict'}><Save size={15}/>{saveState==='saving'?'Saving':'Save draft'}</button><button className="button primary" disabled={saveState==='saving'||saveState==='conflict'} onClick={async()=>{if(await save()){try{await onAction('room.publish',{audience:'public',baseVersion:draftVersion.current});notice('Room published')}catch{setSaveState('conflict')}}}}><Send size={15}/> Publish</button></div></div>
    {!preview&&<div className="room-toolbar"><label>Room name<input value={name} onChange={e=>{setName(e.target.value);markDirty()}} maxLength={180}/></label><label>Mood<select value={mood} onChange={e=>{setMood(e.target.value);markDirty()}}><option value="study">The Study</option><option value="sunroom">Sunroom</option><option value="archive">Archive</option><option value="afterhours">After Hours</option></select></label><label><Sun size={16}/> Light <input type="range" min="0" max="100" value={scene.light} onChange={e=>change({...scene,light:Number(e.target.value)})}/></label><button className="icon-button" title="Undo" onClick={()=>{if(history.length){setScene(history[history.length-1]);setHistory(history.slice(0,-1));markDirty()}}} disabled={!history.length}><RotateCcw size={17}/></button></div>}
    <div className="room-layout"><RoomScene scene={scene} name={name} mood={mood} books={copies} selected={selected} onSelect={setSelected} onPointerDown={dragStart} onPointerMove={dragMove} emptyMessage="A room begins with one object. Choose a piece below."/>
    {!preview&&<aside className="room-palette"><h3>Place something</h3><div className="palette-grid">{(['shelf','chair','plant','lamp','art'] as const).map(type=><button key={type} onClick={()=>add(type)}><Plus size={15}/>{type}</button>)}</div><h3>Your physical books</h3>{eligibleCopies.filter(c=>c.status!=='archived').length===0?<p className="muted">Add a copy to put it in your Room.</p>:<div className="book-palette">{eligibleCopies.filter(c=>c.status!=='archived').map(c=><button key={c.id} onClick={()=>add('book',c.id)}><span>▰</span><span>{c.title}<small>{c.status}</small></span><Plus size={14}/></button>)}</div>}
      {active&&<div className="selection-tools"><h3>Selected {active.type}</h3><label>Left / right <input type="range" min="0" max="100" value={active.x} onChange={e=>update(active.id,{x:Number(e.target.value)})}/></label><label>Forward / back <input type="range" min="0" max="100" value={active.y} onChange={e=>update(active.id,{y:Number(e.target.value)})}/></label><label>Turn <input type="range" min="-180" max="180" value={active.rotation} onChange={e=>update(active.id,{rotation:Number(e.target.value)})}/></label><label>Size <input type="range" min="0.5" max="2" step="0.1" value={active.scale??1} onChange={e=>update(active.id,{scale:Number(e.target.value)})}/></label><label>Color <input type="color" value={active.color} onChange={e=>update(active.id,{color:e.target.value})}/></label><button className="button danger" onClick={()=>{change({...scene,objects:scene.objects.filter(o=>o.id!==active.id)});setSelected(null)}}><Trash2 size={14}/> Remove</button></div>}
    </aside>}</div>{!preview&&revisions.length>0&&<div className="room-revisions"><label>Saved draft revisions <select defaultValue="" disabled={saveState!=='saved'} onChange={e=>{const version=Number(e.target.value);if(version)void restore(version);e.target.value=''}}><option value="">Choose a revision to restore</option>{revisions.map(item=><option key={item.version} value={item.version}>v{item.version} · {item.name} · {new Date(item.created_at).toLocaleString()}</option>)}</select></label><p>Restoring creates a new draft revision. The published Room stays as it is until you publish again.</p></div>}<p className="muted tiny">Decorative objects do not change book ownership. Public visitors see only books whose listings and visibility permit it.</p></div>;
}
