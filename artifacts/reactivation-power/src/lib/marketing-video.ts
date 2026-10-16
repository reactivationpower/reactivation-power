import { track } from './marketing-tracker'
/** Samples observed foreground playback, never extrapolates seek gaps or stalled time. */
export function observeMarketingVideo(video:HTMLVideoElement,placement:string){
  let previous:{wall:number;position:number;rate:number}|null=null
  let running=false
  let intervals:[number,number][]=[]
  let elapsed=0
  const detail=()=>({video:'walkthrough' as const,placement,position:Math.max(0,Math.min(240,video.currentTime||0))})
  const emit=()=>{
    if(intervals.length||elapsed)track('video_progress',{...detail(),intervals,elapsed})
    intervals=[];elapsed=0
  }
  const sample=()=>{
    const now=performance.now(),pos=video.currentTime,rate=video.playbackRate
    const active=running&&!video.paused&&!video.seeking&&!document.hidden&&video.readyState>=3
    if(active&&previous){
      const wall=(now-previous.wall)/1000,delta=pos-previous.position
      if(wall>0&&wall<=2.5&&delta>0&&delta<=wall*previous.rate+0.4&&previous.rate===rate){
        intervals.push([Math.min(240,previous.position),Math.min(240,pos)])
        // Do not count wall time with no corresponding media progression.
        elapsed+=Math.min(wall,delta/rate)
      }
    }
    previous=active?{wall:now,position:pos,rate}:null
    if(intervals.length>=8)emit()
  }
  const play=()=>{running=true;previous=null;sample();track('video_play',detail())}
  const pause=()=>{sample();running=false;previous=null;emit();track('video_pause',detail())}
  const wait=()=>{sample();running=false;previous=null;emit()}
  const seek=()=>{previous=null;emit();track('video_seek',detail())}
  const sought=()=>{previous=null;running=!video.paused;sample()}
  const rate=()=>{sample();previous=null;emit()}
  const hidden=()=>{previous=null;emit()}
  const ended=()=>{sample();running=false;previous=null;emit();track('video_complete',detail())}
  const error=()=>{wait();track('video_error',{...detail(),category:'media'})}
  const listeners:Record<string,()=>void>={playing:play,pause,waiting:wait,stalled:wait,seeking:seek,seeked:sought,ratechange:rate,ended,error}
  for(const [name,fn]of Object.entries(listeners))video.addEventListener(name,fn)
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',hidden)
  const interval=setInterval(sample,1000)
  return()=>{sample();emit();clearInterval(interval);for(const[name,fn]of Object.entries(listeners))video.removeEventListener(name,fn);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',hidden)}
}
