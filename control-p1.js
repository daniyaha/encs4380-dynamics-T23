(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ids = ['kp','ki','kd','sp','limit','K','tau','m','b','k'];
  let plant = 'first';
  const fmt = (v,unit='') => Number.isFinite(v) ? v.toFixed(2)+unit : 'Not reached';
  const clamp = (x,lo,hi)=>Math.min(hi,Math.max(lo,x));
  const current = () => Object.fromEntries(ids.map(id=>[id,Number($(id).value)]));

  // Numerical Euler integration for the plant (no closed-form step response).
  // D action uses a low-pass-filtered derivative of the measured output.
  // Conditional integration prevents integral windup while the actuator saturates.
  function simulate(p, type='first', duration=12, dt=0.005) {
    let y=0, velocity=0, integral=0, previousY=0, filteredRate=0;
    const derivativeFilterTau=0.05; // seconds; disclosed in the page notes
    const samples=[], trace=[];
    const N=Math.ceil(duration/dt), decimation=Math.max(1,Math.floor(N/400));
    let peak=-Infinity, lastOutside=-1;

    for(let i=0;i<=N;i++) {
      const t=i*dt, err=p.sp-y;
      // Filtering reduces numerical oscillations from a finite-difference derivative.
      const measuredRate=i===0 ? 0 : (y-previousY)/dt;
      const alpha=dt/(derivativeFilterTau+dt);
      filteredRate+=alpha*(measuredRate-filteredRate);
      const derivative=-filteredRate; // derivative on measurement avoids a setpoint kick

      let raw=p.kp*err+p.ki*integral+p.kd*derivative;
      if(i<N && p.ki>0) {
        const trial=integral+err*dt;
        const proposed=p.kp*err+p.ki*trial+p.kd*derivative;
        const wouldWindUp=(proposed>p.limit && err>0) || (proposed< -p.limit && err<0);
        if(!wouldWindUp) integral=trial;
        raw=p.kp*err+p.ki*integral+p.kd*derivative;
      }
      const u=clamp(raw,-p.limit,p.limit);
      trace.push({t,y});
      if(i%decimation===0 || i===N) samples.push({t,y,u});
      peak=Math.max(y,peak);
      // Settling is explicitly measured relative to the requested setpoint.
      if(Math.abs(y-p.sp)>.02*Math.abs(p.sp)) lastOutside=i;
      if(i===N) break;

      previousY=y;
      if(type==='first') {
        y+=dt*(p.K*u-y)/p.tau;
      } else {
        const acceleration=(u-p.b*velocity-p.k*y)/p.m;
        velocity+=dt*acceleration;
        y+=dt*velocity;
      }
      if(!Number.isFinite(y) || Math.abs(y)>1e7)
        return {unstable:true,samples:[],trace:[],rise:null,overshoot:null,settling:null,error:null,final:null};
    }

    const final=trace[trace.length-1].y;
    // 10%-to-90% rise time is referenced to a stable final value, not the setpoint.
    // This also gives P-only controllers (which have a steady-state offset) a rise time.
    const tail=trace.filter(d=>d.t>=duration-1);
    const tailRange=Math.max(...tail.map(d=>d.y))-Math.min(...tail.map(d=>d.y));
    const settledNearFinal=tailRange<=0.005*Math.max(Math.abs(p.sp),Math.abs(final));
    const crossing=(level)=>{
      for(let j=1;j<trace.length;j++){
        const a=trace[j-1], b=trace[j];
        if(a.y<level && b.y>=level && b.y>a.y)
          return a.t+(level-a.y)*(b.t-a.t)/(b.y-a.y);
      }
      return null;
    };
    const t10=settledNearFinal && final>0 ? crossing(.1*final) : null;
    const t90=settledNearFinal && final>0 ? crossing(.9*final) : null;
    return {
      unstable:false,samples,trace,final,
      rise:t10!==null && t90!==null ? t90-t10 : null,
      overshoot:Math.max(0,(peak-p.sp)/p.sp*100),
      settling:lastOutside===N ? null : lastOutside<0 ? 0 : trace[lastOutside+1].t,
      error:Math.abs(p.sp-final)/Math.abs(p.sp)*100
    };
  }

  function graph(target, samples, specs, minOverride=null, maxOverride=null) {
    if(!samples.length) {$(target).textContent='Simulation diverged. Reduce the gains and retry.';return;}
    const W=850,H=292,left=65,right=22,top=23,bottom=49;
    let vals=[];
    specs.forEach(s=>{if(typeof s.constant==='number')vals.push(s.constant);else vals.push(...samples.map(d=>d[s.key]));});
    let ymin=Number.isFinite(minOverride)?minOverride:Math.min(...vals,0), ymax=Number.isFinite(maxOverride)?maxOverride:Math.max(...vals,0);
    const span=Math.max(.2,ymax-ymin);ymin-=span*.1;ymax+=span*.1;
    const x=t=>left+(W-left-right)*t/Math.max(1e-10,samples[samples.length-1].t);
    const y=v=>top+(H-top-bottom)*(ymax-v)/(ymax-ymin);
    const ticks=5;
    let svg=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${target==='responsePlot'?'Output and setpoint':'Control signal and its limits'} over time">`;
    for(let i=0;i<=ticks;i++){
      const xv=left+(W-left-right)*i/ticks, tv=samples[samples.length-1].t*i/ticks;
      svg+=`<line x1="${xv}" y1="${top}" x2="${xv}" y2="${H-bottom}" stroke="#f0eaf4" stroke-width="1"/><text x="${xv}" y="${H-20}" text-anchor="middle" font-size="14" fill="#91829c">${tv.toFixed(0)}</text>`;
    }
    for(let i=0;i<=4;i++){
      const yv=top+(H-top-bottom)*i/4, value=ymax-(ymax-ymin)*i/4;
      svg+=`<line x1="${left}" y1="${yv}" x2="${W-right}" y2="${yv}" stroke="#f0eaf4" stroke-width="1"/><text x="${left-13}" y="${yv+5}" text-anchor="end" font-size="14" fill="#91829c">${Math.abs(value)<1e-8?'0':value.toFixed(1)}</text>`;
    }
    svg+=`<text x="${W/2}" y="${H-2}" text-anchor="middle" font-size="12" fill="#91829c">Time (s)</text>`;
    for(const s of specs){
      const points= samples.map(d=>`${x(d.t).toFixed(2)},${y(typeof s.constant==='number'?s.constant:d[s.key]).toFixed(2)}`).join(' ');
      svg+=`<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="${s.dashed?2.5:3.5}" stroke-linecap="round" stroke-linejoin="round" ${s.dashed?'stroke-dasharray="9 7"':''}/>`;
    }
    svg+='</svg>';
    $(target).innerHTML=svg;
  }

  function resetQuiz(){ $('predictionResult').classList.add('hidden'); }
  function redraw(){
    const p=current();
    ids.forEach(id=>{const out=$(id+'Value');if(out) out.textContent=Number(p[id]).toFixed(1)+(id==='tau'?' s':'');});
    $('limitChip').textContent=p.limit.toFixed(0);
    const r=simulate(p,plant);
    window.p1CurrentSimulation=r;
    if(r.unstable){['riseMetric','overshootMetric','settlingMetric','errorMetric'].forEach(id=>$(id).textContent='Unstable');['responsePlot','controlPlot'].forEach(id=>$(id).textContent='Simulation diverged. Reduce the gains and retry.');return;}
    graph('responsePlot',r.samples,[{key:'y',color:'#8261b4'},{constant:p.sp,color:'#e5a1b3',dashed:true}]);
    graph('controlPlot',r.samples,[{key:'u',color:'#8261b4'},{constant:p.limit,color:'#e5a1b3',dashed:true},{constant:-p.limit,color:'#e5a1b3',dashed:true}],-p.limit,p.limit);
    $('riseMetric').textContent=fmt(r.rise,' s');
    $('overshootMetric').textContent=fmt(r.overshoot,'%');
    $('settlingMetric').textContent=fmt(r.settling,' s');
    $('errorMetric').textContent=fmt(r.error,'%');
    resetQuiz();
  }

  ids.forEach(id=>$(id).addEventListener('input',redraw));
  document.querySelectorAll('[data-plant]').forEach(button=>button.addEventListener('click',()=>{
    plant=button.dataset.plant;
    document.querySelectorAll('[data-plant]').forEach(tab=>tab.classList.toggle('active',tab===button));
    $('firstInputs').classList.toggle('hidden',plant!=='first');
    $('secondInputs').classList.toggle('hidden',plant!=='second');
    $('plantFormula').textContent=plant==='first'?'G(s) = K / (τs + 1)':'G(s) = 1 / (ms² + bs + k)';
    $('plantDescription').textContent=plant==='first'?'A single time constant describes how quickly the output reacts.':'Mass, damping and stiffness shape the second-order response.';
    redraw();
  }));
  function setValues(values){Object.entries(values).forEach(([key,val])=>{if($(key))$(key).value=val;});redraw();}
  document.querySelectorAll('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>{
    const chosen=btn.dataset.preset;
    setValues(chosen==='p'?{kp:9,ki:0,kd:0}:chosen==='pi'?{kp:1,ki:1,kd:0}:{kp:8,ki:3,kd:1.2});
  }));
  $('resetButton').addEventListener('click',()=>{plant='first';document.querySelectorAll('[data-plant]').forEach(b=>b.classList.toggle('active',b.dataset.plant==='first'));$('firstInputs').classList.remove('hidden');$('secondInputs').classList.add('hidden');$('plantFormula').textContent='G(s) = K / (τs + 1)';$('plantDescription').textContent='A single time constant describes how quickly the output reacts.';setValues({kp:9,ki:0,kd:0,sp:1,limit:10,K:1,tau:1,m:1,b:2,k:1});});
  $('checkPrediction').addEventListener('click',()=>{
    const p=current(), a=simulate(p,plant), b=simulate({...p,ki:p.ki+0.5},plant);
    const box=$('predictionResult');box.classList.remove('hidden');
    if(a.unstable||b.unstable){box.textContent='One simulation became unstable. Try smaller gains.';return;}
    const delta=b.error-a.error;
    const actual=Math.abs(delta)<0.05?'same':delta<0?'decrease':'increase';
    const label=actual==='same'?'stayed almost the same':actual==='decrease'?'decreased':'increased';
    const correct=actual===$('prediction').value;
    box.innerHTML=`<b class="${correct?'pass':'fail'}">${correct?'✓ Your prediction matched.':'↗ Interesting result! Your prediction did not match.'}</b><br>Current end error: <b>${a.error.toFixed(2)}%</b> · With Ki = ${(p.ki+.5).toFixed(1)}: <b>${b.error.toFixed(2)}%</b>. The error ${label} in this 12-second simulation. Integral action often reduces lasting offset, but too much can change transient behavior.`;
  });
  $('runValidation').addEventListener('click',()=>{
    const base={sp:1,limit:10,K:1,tau:1,m:1,b:2,k:1,kd:0};
    const a=simulate({...base,kp:9,ki:0},'first',20);
    const aShort=simulate({...base,kp:9,ki:0},'first',1,0.001);
    const b=simulate({...base,kp:1,ki:1},'first',25);
    const c=simulate({...base,kp:2,ki:0.7},'first',40);

    // Measure the time to 63.2% of the analytical final value from the numerical trace.
    const finalP=base.sp*base.K*9/(1+base.K*9);
    const target63=finalP*(1-Math.exp(-1));
    let simulatedTau=null;
    for(let j=1;j<aShort.trace.length;j++){
      const prev=aShort.trace[j-1], cur=aShort.trace[j];
      if(prev.y<target63 && cur.y>=target63){
        simulatedTau=prev.t+(target63-prev.y)*(cur.t-prev.t)/(cur.y-prev.y);
        break;
      }
    }
    const expectedTau=base.tau/(1+base.K*9);
    const pass1=Math.abs(a.error-10)<0.1 && simulatedTau!==null && Math.abs(simulatedTau-expectedTau)<0.005;

    // PI transfer function has characteristic tau*s^2+(1+K*Kp)*s+K*Ki.
    const omegaN=Math.sqrt(base.K*1/base.tau);
    const zeta=(1+base.K*1)/(2*Math.sqrt(base.tau*base.K*1));
    const pass2=Math.abs(omegaN-1)<1e-10 && Math.abs(zeta-1)<1e-10 && b.overshoot<0.5 && b.error<0.1;
    const pass3=c.error<0.1;

    const box=$('validationResult');box.classList.remove('hidden');
    box.innerHTML=`<div class="${pass1?'pass':'fail'}">${pass1?'✓':'✕'} P-only: numerical end error ${a.error.toFixed(2)}% (expected 10%); numerical τcl = ${simulatedTau===null?'not reached':simulatedTau.toFixed(3)+' s'} (expected ${expectedTau.toFixed(3)} s).</div><div class="${pass2?'pass':'fail'}">${pass2?'✓':'✕'} PI: ωn = ${omegaN.toFixed(2)} rad/s, ζ = ${zeta.toFixed(2)}; numerical overshoot ${b.overshoot.toFixed(2)}%, end error ${b.error.toFixed(3)}%.</div><div class="${pass3?'pass':'fail'}">${pass3?'✓':'✕'} Stable PI step tracking: numerical end error ${c.error.toFixed(3)}% at 40 s (approaches 0%).</div>`;
  });

  redraw();
})();
