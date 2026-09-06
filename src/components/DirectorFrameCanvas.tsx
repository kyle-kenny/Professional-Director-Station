import { useEffect, useRef } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { projectWorldToFrame } from '../utils/math';

export function DirectorFrameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const shot = useDirectorStore((s) => s.getActiveShot());
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx=canvas.getContext('2d')!; const dpr=Math.min(devicePixelRatio,2);
    const draw=()=>{
      const rect=canvas.getBoundingClientRect(); canvas.width=rect.width*dpr; canvas.height=rect.height*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
      const w=rect.width,h=rect.height; ctx.fillStyle='#101419'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1;
      [1/3,2/3].forEach((v)=>{ctx.beginPath();ctx.moveTo(w*v,0);ctx.lineTo(w*v,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,h*v);ctx.lineTo(w,h*v);ctx.stroke();});
      ctx.strokeStyle='rgba(255,209,102,.45)'; ctx.strokeRect(w*.05,h*.05,w*.9,h*.9);
      shot.actors.forEach((a,i)=>{
        const foot=projectWorldToFrame(a.transform.position,shot.camera,w/h);
        const head=projectWorldToFrame({x:a.transform.position.x,y:a.eyeHeight,z:a.transform.position.z},shot.camera,w/h);
        if(!foot.visible&&!head.visible)return;
        const x=head.x*w, y=head.y*h, bottom=foot.y*h, bodyH=Math.max(24,bottom-y);
        ctx.strokeStyle=i%2?'#d9a36d':'#7db6e8'; ctx.lineWidth=4;
        ctx.beginPath();ctx.arc(x,y,Math.max(8,bodyH*.09),0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x,y+bodyH*.1);ctx.lineTo(x,bottom);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x-bodyH*.22,y+bodyH*.35);ctx.lineTo(x+bodyH*.22,y+bodyH*.35);ctx.stroke();
        ctx.beginPath();ctx.moveTo(x,bottom);ctx.lineTo(x-bodyH*.14,Math.min(h,bottom+bodyH*.25));ctx.moveTo(x,bottom);ctx.lineTo(x+bodyH*.14,Math.min(h,bottom+bodyH*.25));ctx.stroke();
        ctx.fillStyle='#dfe7ef';ctx.font='12px sans-serif';ctx.fillText(a.name,x+12,y-8);
      });
      ctx.fillStyle='#dbe6ef';ctx.font='13px ui-monospace, monospace';ctx.fillText(`${shot.name}  |  ${shot.camera.focalLengthMm}mm  |  ${shot.camera.sensorWidthMm}mm sensor`,18,h-22);
      ctx.fillStyle='rgba(255,255,255,.55)';ctx.fillText('Rule of thirds · Action safe · Director structural frame',18,24);
    };
    draw(); const ro=new ResizeObserver(draw); ro.observe(canvas); return()=>ro.disconnect();
  },[shot]);
  return <div className="canvas-workspace"><div className="canvas-header"><span className="chip">Director Frame / 构图结构图</span><span>由3D机位与人物位置计算，不由AI猜测</span></div><canvas ref={ref}/></div>;
}
