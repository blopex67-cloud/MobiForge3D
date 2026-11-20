import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';

self.onmessage = ({data}) => {
  const output=[]; let L=null;
  try {
    L=lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
    // The runtime cannot access operating-system, filesystem, package-loading or debug APIs.
    for(const name of ['os','io','debug','package']) { lua.lua_pushnil(L); lua.lua_setglobal(L,to_luastring(name)); }
    lua.lua_pushjsfunction(L,(state)=>{
      const n=lua.lua_gettop(state), parts=[];
      for(let i=1;i<=n;i++) { const s=lua.lua_tostring(state,i); parts.push(s?to_jsstring(s):'nil'); }
      output.push(parts.join('\t')); return 0;
    });
    lua.lua_setglobal(L,to_luastring('print'));
    let status=lauxlib.luaL_loadstring(L,to_luastring(String(data?.source||'')));
    if(status===lua.LUA_OK) status=lua.lua_pcall(L,0,lua.LUA_MULTRET,0);
    if(status!==lua.LUA_OK) {
      const err=lua.lua_tostring(L,-1); self.postMessage({error:err?to_jsstring(err):'Error al ejecutar Lua'});
    } else self.postMessage({output:output.join(' | ')});
  } catch(e) { self.postMessage({error:String(e?.message||e)}); }
  finally { if(L)lua.lua_close(L); }
};
