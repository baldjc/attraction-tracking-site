import { NextResponse } from "next/server";

const SNIPPET = `(function(){var script=document.currentScript;var memberId=script.getAttribute('data-id');if(!memberId)return;var API_BASE='https://members.attractionbyvideo.com';var COOKIE_NAME='_atref';var SESSION_KEY='_atsid';function getCookie(name){var match=document.cookie.match(new RegExp('(^| )'+name+'=([^;]+)'));return match?match[2]:null;}function setCookie(name,value,days){var d=new Date();d.setTime(d.getTime()+days*86400000);document.cookie=name+'='+value+';expires='+d.toUTCString()+';path=/;SameSite=Lax;Secure';}function getSession(){try{return sessionStorage.getItem(SESSION_KEY);}catch(e){return null;}}function setSession(sid){try{sessionStorage.setItem(SESSION_KEY,sid);}catch(e){}}var urlParams=new URLSearchParams(window.location.search);var refParam=urlParams.get('ref');var currentRef=refParam||getCookie(COOKIE_NAME);var currentSession=getSession();if(refParam){setCookie(COOKIE_NAME,refParam,30);fetch(API_BASE+'/api/tracking/click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref_code:refParam,page_url:window.location.href,member_id:memberId})}).then(function(r){return r.json();}).then(function(data){if(data.session_id){setSession(data.session_id);}}).catch(function(){});}else if(currentRef&&currentSession){fetch(API_BASE+'/api/tracking/pageview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:currentSession,page_url:window.location.href,member_id:memberId})}).catch(function(){});}})();`;

export async function GET() {
  return new NextResponse(SNIPPET, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
