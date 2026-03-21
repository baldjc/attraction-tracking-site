import { NextResponse } from "next/server";

// Pre-minified tracking snippet.
// All regex backslashes are doubled (\\d, \\., \\/) because this is a JS string literal —
// single backslashes are silently dropped by the runtime before the string value is formed.
const SNIPPET =
  "(function(){" +
  "if(window._atbvFired)return;" +
  "window._atbvFired=true;" +
  "var script=document.currentScript;" +
  "var memberId=script.getAttribute('data-id');" +
  "if(!memberId)return;" +
  "var tyAttr=script.getAttribute('data-ty')||'';" +
  "var API_BASE=script.src?(new URL(script.src).origin):'https://members.attractionbyvideo.com';" +
  "var COOKIE_NAME='_atref';" +
  "var SESSION_KEY='_atsid';" +
  // getRootDomain: extracts registrable domain so cookie is shared across subdomains
  "function getRootDomain(){" +
    "var h=window.location.hostname;" +
    "if(h==='localhost'||/^\\d{1,3}(\\.\\d{1,3}){3}$/.test(h))return null;" +
    "var p=h.split('.');" +
    "if(p.length<=2)return h;" +
    "var tld=p[p.length-1];" +
    "var sld=p[p.length-2];" +
    "return(tld.length===2&&sld.length<=3)?p.slice(-3).join('.'):p.slice(-2).join('.');" +
  "}" +
  "function getCookie(n){var m=document.cookie.match(new RegExp('(^| )'+n+'=([^;]+)'));return m?m[2]:null;}" +
  "function setCookie(n,v,d){" +
    "var e=new Date();" +
    "e.setTime(e.getTime()+d*86400000);" +
    "var r=getRootDomain();" +
    "var dp=r?';domain=.'+r:'';" +
    "document.cookie=n+'='+v+';expires='+e.toUTCString()+';path=/'+dp+';SameSite=Lax;Secure';" +
  "}" +
  "function getSession(){try{return sessionStorage.getItem(SESSION_KEY);}catch(e){return null;}}" +
  "function setSession(s){try{sessionStorage.setItem(SESSION_KEY,s);}catch(e){}}" +
  "function normPath(raw){" +
    "try{return new URL(raw).pathname.toLowerCase().replace(/\\/$/,'')||'/';}" +
    "catch(e){return raw.split('?')[0].split('#')[0].toLowerCase().replace(/\\/$/,'')||'/';}" +
  "}" +
  "var tyPath=tyAttr?normPath(tyAttr):'';" +
  "var currentPath=normPath(window.location.pathname);" +
  "var isThankYou=tyPath&&currentPath===tyPath;" +
  "var urlParams=new URLSearchParams(window.location.search);" +
  "var refParam=urlParams.get('ref');" +
  "var currentRef=refParam||getCookie(COOKIE_NAME);" +
  "var currentSession=getSession();" +
  "if(refParam){" +
    "setCookie(COOKIE_NAME,refParam,30);" +
    "fetch(API_BASE+'/api/tracking/click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref_code:refParam,page_url:window.location.href,member_id:memberId})})" +
      ".then(function(r){return r.json();})" +
      ".then(function(data){" +
        "if(data.session_id){" +
          "setSession(data.session_id);" +
          "if(isThankYou){" +
            "fetch(API_BASE+'/api/tracking/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref_code:refParam,session_id:data.session_id,member_id:memberId})})" +
              ".catch(function(){});" +
          "}" +
        "}" +
      "})" +
      ".catch(function(){});" +
  "}else if(currentRef){" +
    "if(isThankYou){" +
      "fetch(API_BASE+'/api/tracking/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref_code:currentRef,session_id:currentSession||null,member_id:memberId})})" +
        ".catch(function(){});" +
    "}else if(currentSession){" +
      "fetch(API_BASE+'/api/tracking/pageview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:currentSession,page_url:window.location.href,member_id:memberId})})" +
        ".catch(function(){});" +
    "}" +
  "}" +
  "})();";

export async function GET() {
  return new NextResponse(SNIPPET, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
