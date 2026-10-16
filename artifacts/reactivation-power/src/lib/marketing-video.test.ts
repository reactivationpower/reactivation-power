import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const events=vi.hoisted(()=>({track:vi.fn()}))
vi.mock('./marketing-tracker',()=>({track:events.track}))
import { observeMarketingVideo } from './marketing-video'
describe('observed second-resolution video playback',()=>{
  let video:HTMLVideoElement,stop:()=>void
  beforeEach(()=>{
    vi.useFakeTimers();events.track.mockClear()
    Object.defineProperty(document,'hidden',{configurable:true,value:false})
    video=document.createElement('video')
    Object.defineProperty(video,'paused',{configurable:true,value:false})
    Object.defineProperty(video,'readyState',{configurable:true,value:4})
    Object.defineProperty(video,'playbackRate',{configurable:true,writable:true,value:1})
    video.currentTime=0
    stop=observeMarketingVideo(video,'walkthrough')
    video.dispatchEvent(new Event('playing'))
  })
  afterEach(()=>{stop();vi.useRealTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false})})
  function tick(position:number){video.currentTime=position;vi.advanceTimersByTime(1000)}
  function progress(){return events.track.mock.calls.filter(([type])=>type==='video_progress').map(([,detail])=>detail)}
  it('keeps elapsed and content time separate at 2x',()=>{
    video.playbackRate=2;video.dispatchEvent(new Event('ratechange'))
    tick(2);tick(4);tick(6);video.dispatchEvent(new Event('pause'))
    const rows=progress()
    expect(rows.reduce((sum,r)=>sum+r.elapsed,0)).toBe(2)
    expect(rows.flatMap(r=>r.intervals)).toEqual([[2,4],[4,6]])
  })
  it('does not count stalled time or seek gaps',()=>{
    tick(1);tick(2);tick(2)
    video.dispatchEvent(new Event('waiting'));tick(2);tick(2)
    video.currentTime=100;video.dispatchEvent(new Event('seeking'));video.dispatchEvent(new Event('seeked'))
    tick(101);video.dispatchEvent(new Event('pause'))
    expect(progress().flatMap(r=>r.intervals)).toEqual([[0,1],[1,2],[100,101]])
  })
  it('excludes hidden playback and resumes with a fresh baseline',()=>{
    tick(1)
    Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))
    tick(2);tick(3)
    Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))
    tick(4);tick(5);video.dispatchEvent(new Event('pause'))
    expect(progress().flatMap(r=>r.intervals)).toEqual([[0,1],[4,5]])
  })
  it('retains replay intervals for union deduplication and reports media errors safely',()=>{
    tick(1);tick(2)
    video.currentTime=0;video.dispatchEvent(new Event('seeking'));video.dispatchEvent(new Event('seeked'))
    tick(1);tick(2);video.dispatchEvent(new Event('error'))
    expect(progress().flatMap(r=>r.intervals)).toEqual([[0,1],[1,2],[0,1],[1,2]])
    expect(events.track).toHaveBeenCalledWith('video_error',expect.objectContaining({category:'media',video:'walkthrough'}))
    expect(events.track.mock.calls.some(([,d])=>'src' in d)).toBe(false)
  })
})
