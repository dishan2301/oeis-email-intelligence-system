import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {AnimatePresence,motion,useReducedMotion} from "motion/react";
import {ArrowBack,ArrowForward,Check,Close} from "@mui/icons-material";
import {Box,Button,IconButton,LinearProgress,Typography} from "@mui/material";
import {useContent} from "./dynamicContent";

export type TourStep={target:string;eyebrow:string;title:string;description:string};

type Rect={top:number;left:number;width:number;height:number};

function visibleTarget(selector:string){
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${selector}"]`)].find(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0&&getComputedStyle(element).visibility!=="hidden"});
}

export default function GuidedTour({open,steps,onClose,onStepChange}:{open:boolean;steps:TourStep[];onClose:()=>void;onStepChange?:(step:TourStep,index:number)=>void}){
  const{format,text}=useContent();
  const[index,setIndex]=useState(0),[rect,setRect]=useState<Rect|null>(null);const cardRef=useRef<HTMLDivElement>(null);const reduced=useReducedMotion();const step=steps[index];
  useEffect(()=>{if(open)setIndex(0)},[open]);
  useEffect(()=>{if(open&&step)onStepChange?.(step,index)},[open,index,step,onStepChange]);
  useLayoutEffect(()=>{
    if(!open||!step)return;
    let frame=0;
    const measure=()=>{const element=visibleTarget(step.target);if(!element){setRect(null);return}element.scrollIntoView({block:"nearest",inline:"nearest",behavior:reduced?"auto":"smooth"});frame=window.requestAnimationFrame(()=>{const next=element.getBoundingClientRect();setRect({top:next.top,left:next.left,width:next.width,height:next.height});cardRef.current?.focus()})};
    const timer=window.setTimeout(measure,120);window.addEventListener("resize",measure);window.addEventListener("scroll",measure,true);return()=>{window.clearTimeout(timer);window.cancelAnimationFrame(frame);window.removeEventListener("resize",measure);window.removeEventListener("scroll",measure,true)};
  },[open,index,step,reduced]);
  useEffect(()=>{
    if(!open)return;const card=cardRef.current;card?.focus();
    const keyboard=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();finish()}if(event.key!=="Tab"||!card)return;const controls=[...card.querySelectorAll<HTMLElement>('button,[href],[tabindex]:not([tabindex="-1"])')].filter(node=>!node.hasAttribute("disabled"));if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}};
    document.addEventListener("keydown",keyboard);return()=>document.removeEventListener("keydown",keyboard);
  },[open,index,onClose]);
  const finish=()=>{localStorage.setItem("oeis_tour_completed_v1","true");onClose();window.scrollTo({top:0,behavior:reduced?"auto":"smooth"});window.setTimeout(()=>visibleTarget("help")?.focus(),40)};const next=()=>index===steps.length-1?finish():setIndex(value=>value+1);const back=()=>setIndex(value=>Math.max(0,value-1));
  const cardStyle=(()=>{if(innerWidth<700||!rect)return{left:16,bottom:16,width:"calc(100vw - 32px)"};const width=390,gap=18;let left=rect.left+rect.width+gap;if(left+width>innerWidth-18)left=Math.max(18,rect.left-width-gap);let top=Math.min(Math.max(18,rect.top),innerHeight-430);return{left,top,width}})();
  return <AnimatePresence>{open&&<Box className="tour-root" aria-live="polite">
    <motion.div className="tour-dim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.2}}/>
    {rect&&<motion.div className="tour-spotlight" initial={false} animate={{top:rect.top-7,left:rect.left-7,width:rect.width+14,height:rect.height+14}} transition={{duration:reduced?0:.24,ease:[.22,1,.36,1]}}/>}
    <motion.div ref={cardRef} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-description" tabIndex={-1} style={cardStyle} initial={{opacity:0,y:reduced?0:14,scale:reduced?1:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:10}} transition={{duration:reduced?0:.24,ease:[.22,1,.36,1]}}>
      <Box className="tour-card-top"><Box><Typography className="tour-eyebrow">{step.eyebrow}</Typography><Typography variant="caption">{format("tour.count",{current:index+1,total:steps.length})}</Typography></Box><IconButton aria-label={text("tour.skip_product")} onClick={finish}><Close/></IconButton></Box>
      <LinearProgress variant="determinate" value={((index+1)/steps.length)*100}/>
      <Box className="tour-copy" key={index}><Typography id="tour-title" variant="h5">{step.title}</Typography><Typography id="tour-description">{step.description}</Typography></Box>
      <Box className="tour-dots" aria-label={format("tour.progress",{current:index+1,total:steps.length})}>{steps.map((_,dot)=><span key={dot} className={dot===index?"active":dot<index?"done":""}/>)}</Box>
      <Box className="tour-actions"><Button onClick={finish}>{text("tour.skip")}</Button><Box>{index>0&&<Button startIcon={<ArrowBack/>} onClick={back}>{text("tour.back")}</Button>}<Button variant="contained" endIcon={index===steps.length-1?<Check/>:<ArrowForward/>} onClick={next}>{index===steps.length-1?text("tour.finish"):text("tour.next")}</Button></Box></Box>
    </motion.div>
  </Box>}</AnimatePresence>;
}
