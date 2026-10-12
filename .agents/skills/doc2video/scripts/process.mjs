import {spawn} from 'node:child_process';

// Wait for the owned process to exit before releasing its workspace lock.
export function runProcess(command,args,{cwd,env,shell=false,inherit=false,signal,log,onChild}={}) {
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const grouped=!!signal&&process.platform!=='win32';
    const child=spawn(command,args,{cwd,env,shell,detached:grouped,stdio:inherit?'inherit':['ignore','pipe','pipe']});
    let stdout='',stderr='',stopped,timer,windowsKill;
    if(child.pid)onChild?.(child.pid);
    const kill=kind=>{
      if(!child.pid)return;
      if(process.platform==='win32'&&signal){
        if(!windowsKill){
          const killer=spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});
          windowsKill=new Promise(done=>{killer.once('error',()=>{child.kill();done();});killer.once('close',done);});
        }
        return;
      }
      try{grouped?process.kill(-child.pid,kind):child.kill(kind);}catch(e){if(e.code!=='ESRCH')log?.(`终止进程失败：${e.message}\n`);}
    };
    const stop=reason=>{
      if(stopped)return;stopped=reason;kill('SIGTERM');
      timer=setTimeout(()=>kill('SIGKILL'),2000);timer.unref();
    };
    const abort=()=>stop(signal.reason instanceof Error?signal.reason:new Error('任务已取消'));
    const interrupt=()=>stop(Object.assign(new Error('任务被中断'),{code:'TASK_INTERRUPTED'}));
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);process.removeListener('SIGINT',interrupt);onChild?.(null);};
    process.once('SIGINT',interrupt);signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    if(!inherit){
      child.stdout.on('data',data=>{stdout=(stdout+data).slice(-1024*1024);log?.(data.toString());});
      child.stderr.on('data',data=>{stderr=(stderr+data).slice(-16384);log?.(data.toString());});
    }
    child.once('error',error=>{cleanup();reject(error);});
    child.once('close',async(code,exitSignal)=>{
      if(stopped)kill('SIGKILL');
      if(windowsKill)await windowsKill;
      cleanup();
      if(stopped)reject(stopped);
      else if(code===0)resolve(stdout);
      else reject(Object.assign(new Error(`${command} 执行失败：${exitSignal??code}\n${stderr}`),{code:'PROCESS_FAILED'}));
    });
  });
}
