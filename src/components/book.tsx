'use client';
import {useState} from 'react';
export function BookObject({title,author,photo,large=false,interactive=true}:{title:string;author?:string;photo?:string|null;large?:boolean;interactive?:boolean}) {
  const [angle,setAngle]=useState(0);
  return <div className={`book-object ${large?'large':''}`} role="group" aria-label={`${title}${author?` by ${author}`:''}`}>
    <span className="book-turn" role={interactive?'button':undefined} tabIndex={interactive?0:undefined} aria-label={interactive?`Rotate ${title}`:undefined} onClick={interactive?(e)=>{e.stopPropagation();setAngle((angle+1)%4)}:undefined} onKeyDown={interactive?(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setAngle((angle+1)%4)}}:undefined}>
      <span className="book-volume" style={{transform:`rotateY(${-18+angle*90}deg)`}}>
        <span className="book-cover">{photo?<img src={photo} alt="Owner supplied front photo"/>:<span className="cover-content"><span className="cover-sigil">✦</span><strong>{title}</strong><small>{author}</small></span>}</span>
        <span className="book-spine"><span>{title}</span></span><span className="book-pages"/><span className="book-back"/>
      </span>
    </span>
  </div>
}
